import type { CommandContext } from "../../types/command-context"
import { existsSync } from "fs"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const testGapCommand = {
  name: "fd-test-gap",
  description: "Test Gap Detector — identify areas of a proposed change weakly covered by tests and suggest the minimum high-value tests to add first",
  async execute(context: CommandContext, args?: { scope?: string; change?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    const scope = args?.scope || "all"
    const change = args?.change || ""
    const state = readPlanningState(dir)
    const cd = codebaseDir(dir)

    const config = {
      scope,
      change_description: change,
      agents: [
        { name: "tester", role: "find source files changed with no corresponding test file" },
        { name: "tester", role: "detect untested branches in changed functions (if/else, error paths)" },
        { name: "researcher", role: "identify integration boundaries without contract tests" },
        { name: "reviewer", role: "rank gaps by risk and suggest minimum viable test additions" },
      ],
      gap_types: [
        "missing test file for changed module",
        "untested error path",
        "untested branch (if/else/switch)",
        "no integration test for external call",
        "no regression test for previously-failed path",
      ],
      output_format: {
        gaps: "ranked list: file, gap_type, risk, suggested_test_name, test_skeleton",
        minimum_viable_set: "top 3–5 tests that give the most coverage per effort",
      },
      workflow: "test-gap-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(60),
      "Test Gap Detector",
      "─".repeat(60),
      `  Scope:  ${scope}`,
      `  Change: ${change || "(describe with --change)"}`,
      "─".repeat(60),
      "  tester     → missing test files + untested branches",
      "  researcher → integration boundary gaps",
      "  reviewer   → ranked gaps + minimum viable test set",
      "─".repeat(60),
      "  Output: gap report + top 3–5 suggested tests with skeletons",
      "═".repeat(60),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
