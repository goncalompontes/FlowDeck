import { existsSync, readFileSync } from "fs"
import { statePath, planningDir, codebaseDir, phasePlanPath, timestamp, readPlanningState, updateTDDState, type TDDState, type PlanningStateWithTDD } from "../../tools/planning-state-lib"
import { codebaseStateTool } from "../../tools/codebase-state"
import { runImpactRadar, impactRadarSummaryLines, lookupPriorFailures } from "../../lib/impact-radar"
import { buildAgentConfig } from "../../services/model-router"
import { startTrace } from "../../services/run-trace"
import { appendEvent } from "../../services/telemetry"
import type { CommandContext } from "../../types/command-context"

export const newFeatureCommand = {
  name: "fd-new-feature",
  description: "Execute feature implementation — guard check, orchestrator coordination, parallel coder+researcher, reviewer, tester, STATE.md update",
  async execute(context: CommandContext, args?: { feature?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    // D-15: Guard check - all 3 prerequisites required
    const pd = planningDir(dir)
    const cd = codebaseDir(dir)

    const checks = {
      ".planning/": existsSync(pd),
      ".codebase/": existsSync(cd),
      "PLAN.md confirmed": () => {
        if (!existsSync(sp)) return false
        const state = readPlanningState(dir)
        return state.plan_confirmed === true
      }
    }

    const missing = Object.entries(checks).filter(([, v]) => typeof v === "boolean" ? !v : !v()).map(([k]) => k)
    if (missing.length > 0) {
      return {
        error: `Missing prerequisites: ${missing.join(", ")}`,
        code: "GUARD_FAILED",
        hint: "Run /new-project, /map-codebase, and /plan first"
      }
    }

    const state = readPlanningState(dir)
    const phase = state.phase

    const planPath = phasePlanPath(dir, phase)
    if (!existsSync(planPath)) {
      return {
        error: "PLAN.md not found. Run /plan first.",
        code: "NO_PLAN"
      }
    }

    // Run impact radar on the feature description + plan content
    const featureText = args?.feature ?? readFileSync(planPath, "utf-8").split("\n").slice(0, 10).join(" ")
    const radar = runImpactRadar(dir, featureText)
    const priorFailures = lookupPriorFailures(dir, "all", featureText)

    // Start a run trace for observability
    const trace = startTrace(dir, "fd-new-feature", { feature: args?.feature ?? "", phase }, process.env.OPENCODE_SESSION_ID)
    appendEvent(dir, {
      session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
      run_id: trace.run_id,
      event: "command.start",
      command: "fd-new-feature",
      risk_score: radar.score,
      meta: { phase, plan_file: planPath },
    })

    // Initialize TDD state if not already set
    let tddState = state["tdd"] as TDDState | undefined
    if (!tddState) {
      updateTDDState(dir, {
        stage: "behavior",
        cycle: 1,
        behaviors: [],
        regression_test_links: [],
        override_log: [],
        failing_tests: 0,
        passing_tests: 0,
      })
      tddState = readPlanningState(dir)["tdd"]
    }

    const codebaseResult = codebaseStateTool.execute({ action: "read", files: ["STACK.md", "ARCHITECTURE.md"] }, context as any)

    // Build agent configs using model router (replaces hardcoded models)
    const riskScore = radar.score
    const agentConfigs = buildAgentConfig(dir, [
      { name: "coder", task_type: "implementation", risk_score: riskScore },
      { name: "researcher", task_type: "analysis", risk_score: riskScore },
      { name: "reviewer", task_type: "review", risk_score: riskScore },
      { name: "tester", task_type: "testing", risk_score: riskScore },
    ])

    const workflow = "execute-flow.md"

    const config = {
      orchestrator: {
        model: agentConfigs.find(a => a.name === "coder")?.model ?? "claude-sonnet-4-5",
        temperature: 0.3,
        maxSteps: 60
      },
      agents: agentConfigs,
      run_id: trace.run_id,
      parallel: {
        coder: true,
        researcher: true,
      },
      worktree: true,
      impact_radar: radar,
      prior_failures: priorFailures.map(f => ({
        id: f.id,
        type: f.type,
        description: f.description,
        affected_paths: f.affected_paths,
        root_cause: f.root_cause ?? null,
        fix_applied: f.fix_applied ?? null,
        recurrence_count: f.recurrence_count,
      })),
      post_execution: {
        step: "record",
        agent: "orchestrator",
        actions: [
          { tool: "repo-memory", action: "record", note: "add new module to MEMORY.json" },
          { tool: "failure-replay", action: "record", condition: "if any build, test, or deployment failure occurred during this feature", note: "log to FAILURES.json for future reference" },
        ],
      },
    }

    if (args?.json) {
      return {
        success: true,
        data: { workflow, config, phase, plan_file: planPath },
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const radarLines = impactRadarSummaryLines(radar)

    const priorFailureLines: string[] = priorFailures.length > 0
      ? [
          "─".repeat(55),
          `  Prior failures in this area (${priorFailures.length}):`,
          ...priorFailures.map(f => {
            const rc = f.recurrence_count > 1 ? ` (×${f.recurrence_count})` : ""
            const cause = f.root_cause ? ` — ${f.root_cause.substring(0, 60)}` : ""
            return `  ⚠ [${f.id}]${rc}${cause}`
          }),
        ]
      : []

    const tddStage = tddState ? tddState.stage.toUpperCase() : "NONE"
    const tddFailing = tddState ? tddState.failing_tests : 0
    const tddPassing = tddState ? tddState.passing_tests : 0
    const tddBehaviors = tddState ? tddState.behaviors.length : 0
    const tddCycles = tddState ? tddState.cycle : 0

    const tableLines = [
      "═".repeat(55),
      `New Feature: phase ${phase}`,
      "─".repeat(55),
      `  Guard: .planning/ ✓  .codebase/ ✓  plan_confirmed ✓`,
      "─".repeat(55),
      `  TDD Stage: ${tddStage} | Cycle: ${tddCycles}`,
      `  Tests: ${tddFailing} failing | ${tddPassing} passing`,
      `  Behaviors: ${tddBehaviors} defined`,
      ...priorFailureLines,
      ...radarLines,
      "─".repeat(55),
      "  orchestrator → coordinates TDD execution",
      "  TDD cycle:    → RED (write failing tests) → GREEN (minimum impl) → REFACTOR",
      "  sequential:   → @reviewer, @tester",
      "  post-exec:    → record module (repo-memory) + any failures (failure-replay)",
      "─".repeat(55),
      `  plan: ${planPath.split("/").pop()}`,
      "═".repeat(55)
    ]

    return {
      success: true,
      message: tableLines.join("\n"),
      workflow,
      config,
      phase,
      plan_file: planPath,
      impact_radar: radar,
      prior_failures: config.prior_failures,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}