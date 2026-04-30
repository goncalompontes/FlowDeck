import { existsSync, readFileSync } from "fs"
import { statePath, planningDir, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const fixBugCommand = {
  name: "fix-bug",
  description: "Load STATE.md + ARCHITECTURE.md — explore scope — researcher — mini-plan — coder fix — regression test — reviewer confirmation",
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

    const workflow = "fix-bug-flow.md"

    const config = {
      phases: [
        { step: 1, name: "explore", agent: "researcher", action: "investigate bug scope via ARCHITECTURE.md" },
        { step: 2, name: "research", agent: "researcher", action: "identify root cause and affected components" },
        { step: 3, name: "mini-plan", agent: "orchestrator", action: "create fix plan from research findings" },
        { step: 4, name: "fix", agent: "coder", action: "implement bug fix" },
        { step: 5, name: "regression", agent: "tester", action: "write and run regression test (MUST PASS)", mode: "regression" },
        { step: 6, name: "verify", agent: "reviewer", action: "confirm fix after regression passes", require_regression_pass: true }
      ],
      scope,
      architecture_context: architectureContext ? architectureContext.substring(0, 500) : null
    }

    if (args?.json) {
      return {
        success: true,
        data: { workflow, config, phase: state.phase },
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const tableLines = [
      "─".repeat(55),
      `Fix Bug: scope=${scope}`,
      `Phase ${state.phase} | 6-step workflow`,
      "─".repeat(55),
      "  [1] explore   → investigate via ARCHITECTURE.md",
      "  [2] research  → identify root cause",
      "  [3] mini-plan → orchestrator creates fix plan",
      "  [4] fix       → @coder implements",
      "  [5] regression → @tester writes/runs test (must pass)",
      "  [6] verify    → @reviewer confirms (after regression)",
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
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}