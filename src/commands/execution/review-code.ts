import type { CommandContext } from "../../types/command-context"
import { existsSync } from "fs"
import { statePath, planningDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { runImpactRadar, impactRadarSummaryLines } from "../../lib/impact-radar"
import { evaluatePolicies, formatViolations } from "../../services/policy-compiler"

export const reviewCodeCommand = {
  name: "fd-review-code",
  description: "Parallel reviewer + researcher + tester — aggregates into critical/major/minor report",
  async execute(context: CommandContext, args?: { scope?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first.",
        code: "NOT_INITIALIZED"
      }
    }

    const scope = args?.scope || "all"
    const state = readPlanningState(dir)

    if (scope.includes("/") && !scope.startsWith("./")) {
      return {
        error: "Invalid scope: absolute paths not allowed",
        code: "INVALID_SCOPE",
        hint: "Use relative paths like ./src or module name"
      }
    }

    // Run impact radar on the scope being reviewed
    const radar = runImpactRadar(dir, scope !== "all" ? scope : "")

    // Evaluate policies against the review scope
    const policyViolations = evaluatePolicies(dir, {
      command: "fd-review-code",
      file_path: scope !== "all" ? scope : undefined,
    })

    const workflow = "review-code-flow.md"

    const config = {
      agents: [
        { name: "reviewer", focus: "quality,security,conventions,TDD_discipline", severity: "critical,high" },
        { name: "researcher", focus: "api contracts,edge cases" },
        { name: "tester", mode: "coverage" }
      ],
      scope,
      aggregate: {
        critical: "reviewer.critical + researcher.critical",
        major: "reviewer.major + researcher.major + tester.missing_tests",
        minor: "reviewer.minor + tester.minor"
      },
      tdd_checks: {
        new_behavior_without_test: "flag as major",
        bugfix_without_regression: "flag as critical",
        implementation_larger_than_tests: "flag as major",
        refactor_without_green: "flag as block",
      },
      impact_radar: radar,
      policy_violations: policyViolations,
    }

    if (args?.json) {
      return {
        success: true,
        data: { workflow, config, phase: state.phase },
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const radarLines = impactRadarSummaryLines(radar)

    const tableLines = [
      "─".repeat(50),
      `Code Review: scope=${scope}`,
      `Phase ${state.phase} | spawning 3 agents in parallel`,
      "─".repeat(50),
      "  reviewer  → quality, security, conventions",
      "  researcher → API contracts, edge cases",
      "  tester    → test coverage",
      ...radarLines,
      ...(policyViolations.length > 0 ? ["─".repeat(50), formatViolations(policyViolations)] : []),
      "─".repeat(50),
      "Aggregating results into critical/major/minor report...",
      "═".repeat(50)
    ]

    return {
      success: true,
      message: tableLines.join("\n"),
      workflow,
      config,
      phase: state.phase,
      impact_radar: radar,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}
