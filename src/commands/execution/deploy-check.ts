import { existsSync } from "fs"
import { statePath, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const deployCheckCommand = {
  name: "fd-deploy-check",
  description: "Parallel tester + reviewer + researcher CVE check — orchestrator go/no-go decision",
  async execute(context, args?: { json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first.",
        code: "NOT_INITIALIZED"
      }
    }

    const state = readPlanningState(dir)

    const workflow = "deploy-check-flow.md"

    const config = {
      agents: [
        { name: "tester", budget: 10, action: "run test suite" },
        { name: "reviewer", budget: 8, action: "quality and security review" },
        { name: "researcher", budget: 12, action: "CVE check (OSV.dev API, no critical false negatives)" }
      ],
      parallel: true,
      aggregation: {
        go_signals: ["testResult.passed", "reviewResult.approved", "cveResult.no_critical_cves"],
        no_go_signals: ["testResult.failures", "reviewResult.critical_issues", "cveResult.critical_cves_found"]
      },
      decision: {
        go: "All checks passed — safe to deploy",
        no_go: "Deploy blocked by: {blocked_by}"
      }
    }

    if (args?.json) {
      return {
        success: true,
        data: { workflow, config, phase: state.phase },
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const tableLines = [
      "═".repeat(55),
      `Deploy Check: phase ${state.phase}`,
      "─".repeat(55),
      "  Parallel agents (step budget):",
      "    tester    → 10 steps (run test suite)",
      "    reviewer  →  8 steps (quality + security)",
      "    researcher → 12 steps (CVE check via OSV.dev)",
      "─".repeat(55),
      "  Aggregating results for go/no-go...",
      "─".repeat(55),
      "  GO    signals: test passed, review approved, no critical CVEs",
      "  NO-GO signals: test failures, critical issues, critical CVEs found",
      "═".repeat(55)
    ]

    return {
      success: true,
      message: tableLines.join("\n"),
      workflow,
      config,
      phase: state.phase,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}