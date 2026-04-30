import { existsSync } from "fs"
import { statePath, planningDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const reviewCodeCommand = {
  name: "review-code",
  description: "Parallel reviewer + researcher + tester — aggregates into critical/major/minor report",
  async execute(context, args?: { scope?: string; json?: boolean }) {
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

    const workflow = "review-code-flow.md"

    if (scope.includes("/") && !scope.startsWith("./")) {
      return {
        error: "Invalid scope: absolute paths not allowed",
        code: "INVALID_SCOPE",
        hint: "Use relative paths like ./src or module name"
      }
    }

    const config = {
      agents: [
        { name: "reviewer", focus: "quality,security,conventions", severity: "critical,high" },
        { name: "researcher", focus: "api contracts,edge cases" },
        { name: "tester", mode: "coverage" }
      ],
      scope,
      aggregate: {
        critical: "reviewer.critical + researcher.critical",
        major: "reviewer.major + researcher.major",
        minor: "reviewer.minor + tester.minor"
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
      "─".repeat(50),
      `Code Review: scope=${scope}`,
      `Phase ${state.phase} | spawning 3 agents in parallel`,
      "─".repeat(50),
      "  reviewer  → quality, security, conventions",
      "  researcher → API contracts, edge cases",
      "  tester    → test coverage",
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
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}
