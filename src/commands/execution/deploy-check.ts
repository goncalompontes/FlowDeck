import type { CommandContext } from "../../types/command-context"
import { existsSync } from "fs"
import { statePath, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const deployCheckCommand = {
  name: "fd-deploy-check",
  description: "Parallel tester + reviewer + researcher CVE check — orchestrator go/no-go decision",
  async execute(context: CommandContext, args?: { json?: boolean }) {
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
        { name: "tester", budget: 10, action: "run test suite + TDD coverage check" },
        { name: "reviewer", budget: 8, action: "quality and security review + TDD discipline" },
        { name: "researcher", budget: 12, action: "CVE check (OSV.dev API, no critical false negatives)" }
      ],
      parallel: true,
      aggregation: {
        go_signals: ["testResult.passed", "reviewResult.approved", "cveResult.no_critical_cves", "tddResult.all_behaviors_tested"],
        no_go_signals: ["testResult.failures", "reviewResult.critical_issues", "cveResult.critical_cves_found", "tddResult.missing_tests", "tddResult.bugfix_no_regression"]
      },
      decision: {
        go: "All checks passed — safe to deploy",
        no_go: "Deploy blocked by: {blocked_by}"
      },
      tdd_aware_checks: {
        new_feature_changes_have_tests: "verify test delta matches code delta",
        bugfix_has_regression_coverage: "ensure regression test exists and passes",
        no_suspicious_test_omissions: "flag if code changed but no corresponding test change",
        overrides_logged: "fail if TDD override used but not surfaced in review",
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
      "    tester    → 10 steps (run test suite + TDD coverage)",
      "    reviewer  →  8 steps (quality + security + TDD discipline)",
      "    researcher → 12 steps (CVE check via OSV.dev)",
      "─".repeat(55),
      "  TDD-aware checks:",
      "    • new feature changes have corresponding tests",
      "    • bugfixes have regression coverage",
      "    • test deltas match code deltas",
      "    • no suspicious test omissions",
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