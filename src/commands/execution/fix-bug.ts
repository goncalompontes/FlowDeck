import { existsSync, readFileSync } from "fs"
import { statePath, planningDir, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { runImpactRadar, impactRadarSummaryLines, lookupPriorFailures } from "../../lib/impact-radar"
import { startTrace } from "../../services/run-trace"
import { appendEvent } from "../../services/telemetry"
import { evaluatePolicies, learnFromFailure, formatViolations } from "../../services/policy-compiler"

export const fixBugCommand = {
  name: "fd-fix-bug",
  description: "Load STATE.md + ARCHITECTURE.md — explore scope — researcher — mini-plan — coder fix — regression test — reviewer confirmation",
  async execute(context, args?: { scope?: string; bug?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first.",
        code: "NOT_INITIALIZED"
      }
    }

    const scope = args?.scope || "all"
    if (scope.includes("/") && !scope.startsWith("./") && scope !== "all") {
      return {
        error: "Invalid scope: absolute paths not allowed",
        code: "INVALID_SCOPE",
        hint: "Use relative path like ./src or 'all'"
      }
    }

    const state = readPlanningState(dir)

    const cd = codebaseDir(dir)
    const archPath = `${cd}/ARCHITECTURE.md`
    let architectureContext = null
    if (existsSync(archPath)) {
      architectureContext = readFileSync(archPath, "utf-8")
    }

    // Run impact radar on the bug description + scope
    const bugText = [args?.bug ?? "", scope !== "all" ? scope : ""].filter(Boolean).join(" ")
    const radar = runImpactRadar(dir, bugText)
    const priorFailures = lookupPriorFailures(dir, scope, args?.bug ?? "")

    // Evaluate active policies against the fix context
    const policyViolations = evaluatePolicies(dir, {
      command: "fd-fix-bug",
      change_description: bugText,
    })

    // Propose new policies from prior failures (returned to AI for consideration)
    const proposedPolicies = priorFailures
      .map(f => learnFromFailure(f.type, f.affected_paths, f.root_cause ?? ""))
      .filter(Boolean)

    // Start run trace
    const trace = startTrace(dir, "fd-fix-bug", { bug: args?.bug ?? "", scope }, process.env.OPENCODE_SESSION_ID)
    appendEvent(dir, {
      session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
      run_id: trace.run_id,
      event: "command.start",
      command: "fd-fix-bug",
      risk_score: radar.score,
      meta: { scope, prior_failure_count: priorFailures.length, policy_violations: policyViolations.length },
    })

    const workflow = "fix-bug-flow.md"

    const config = {
      phases: [
        { step: 1, name: "explore", agent: "researcher", action: "investigate bug scope via ARCHITECTURE.md" },
        { step: 2, name: "research", agent: "researcher", action: "identify root cause and affected components" },
        { step: 3, name: "mini-plan", agent: "orchestrator", action: "create fix plan from research findings" },
        { step: 4, name: "fix", agent: "coder", action: "implement bug fix" },
        { step: 5, name: "regression", agent: "tester", action: "write and run regression test (MUST PASS)", mode: "regression" },
        { step: 6, name: "verify", agent: "reviewer", action: "confirm fix after regression passes", require_regression_pass: true },
        { step: 7, name: "record", agent: "orchestrator", action: "call failure-replay record to log resolved bug in .codebase/FAILURES.json", tool: "failure-replay", tool_action: "record" },
      ],
      run_id: trace.run_id,
      scope,
      architecture_context: architectureContext ? architectureContext.substring(0, 500) : null,
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
      policy_violations: policyViolations,
      proposed_policies: proposedPolicies,
    }

    if (args?.json) {
      return {
        success: true,
        data: { workflow, config, phase: state.phase },
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
      "─".repeat(55),
      `Fix Bug: scope=${scope}`,
      `Phase ${state.phase} | 7-step workflow`,
      "─".repeat(55),
      "  [1] explore   → investigate via ARCHITECTURE.md",
      "  [2] research  → identify root cause",
      "  [3] mini-plan → orchestrator creates fix plan",
      "  [4] fix       → @coder implements",
      "  [5] regression → @tester writes/runs test (must pass)",
      "  [6] verify    → @reviewer confirms (after regression)",
      "  [7] record    → log resolved bug in FAILURES.json",
      ...priorFailureLines,
      ...radarLines,
      ...(policyViolations.length > 0 ? ["─".repeat(55), formatViolations(policyViolations)] : []),
      "─".repeat(55),
      "⚠ Regression test MUST pass before reviewer confirms",
      "═".repeat(55)
    ]

    return {
      success: true,
      message: tableLines.join("\n"),
      workflow,
      config,
      phase: state.phase,
      impact_radar: radar,
      prior_failures: config.prior_failures,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}