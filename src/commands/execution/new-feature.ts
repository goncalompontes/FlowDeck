import { existsSync, readFileSync } from "fs"
import { statePath, planningDir, codebaseDir, phasePlanPath, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { codebaseStateTool } from "../../tools/codebase-state"
import { runImpactRadar, impactRadarSummaryLines, lookupPriorFailures } from "../../lib/impact-radar"

export const newFeatureCommand = {
  name: "fd-new-feature",
  description: "Execute feature implementation — guard check, orchestrator coordination, parallel coder+researcher, reviewer, tester, STATE.md update",
  async execute(context, args?: { feature?: string; json?: boolean }) {
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

    const codebaseResult = codebaseStateTool.execute({ action: "read", files: ["STACK.md", "ARCHITECTURE.md"] }, context)

    const workflow = "execute-flow.md"

    const config = {
      orchestrator: {
        model: "claude-sonnet-4-5",
        temperature: 0.3,
        maxSteps: 60
      },
      agents: [
        { name: "coder", model: "claude-opus-4-5", temperature: 0.2, reasoningEffort: "high" },
        { name: "researcher", model: "gpt-4o", temperature: 0.5 },
        { name: "reviewer", model: "gemini-2.5-flash", temperature: 0.1 },
        { name: "tester", model: "claude-haiku-4-5", temperature: 0.1 }
      ],
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

    const tableLines = [
      "═".repeat(55),
      `New Feature: phase ${phase}`,
      "─".repeat(55),
      `  Guard: .planning/ ✓  .codebase/ ✓  plan_confirmed ✓`,
      ...priorFailureLines,
      ...radarLines,
      "─".repeat(55),
      "  orchestrator → coordinates execution",
      "  parallel:     → @coder + @researcher",
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