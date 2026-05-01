import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"

const REGRESSION_CATEGORIES = [
  "performance",
  "auth",
  "schema",
  "ui-state",
  "async-flow",
  "api-contract",
  "data-integrity",
  "security",
  "config",
  "i18n",
]

export const regressionPredictCommand = {
  name: "fd-regression-predict",
  description: "Regression Prediction — estimate the most likely regression categories (performance, auth, schema, UI states, async flows) for a proposed change",
  async execute(context, args?: { change?: string; files?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    const change = args?.change || ""
    const files = args?.files || ""
    const state = readPlanningState(dir)
    const cd = codebaseDir(dir)

    const failuresPath = join(cd, "FAILURES.json")
    let pastRegressions: string[] = []
    if (existsSync(failuresPath)) {
      try {
        const data = JSON.parse(readFileSync(failuresPath, "utf-8"))
        pastRegressions = (data.entries ?? []).flatMap((e: any) => e.tags ?? [])
      } catch { /* ignore */ }
    }

    const config = {
      change_description: change,
      affected_files: files ? files.split(",").map(s => s.trim()) : [],
      regression_categories: REGRESSION_CATEGORIES,
      past_regression_signals: pastRegressions.slice(0, 20),
      agents: [
        { name: "researcher", role: "map changed code to regression category keywords and patterns" },
        { name: "tester", role: "estimate coverage gaps per predicted regression category" },
        { name: "reviewer", role: "rank categories by probability and severity" },
      ],
      output_format: {
        predictions: "ranked list: category, probability (high/med/low), reason, suggested test",
        top_risk: "single highest-risk regression to watch",
      },
      workflow: "regression-predict-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(60),
      "Regression Prediction",
      "─".repeat(60),
      `  Change:    ${change || "(describe with --change)"}`,
      `  Files:     ${files || "(all affected)"}`,
      `  Categories: ${REGRESSION_CATEGORIES.join(", ")}`,
      "─".repeat(60),
      "  researcher → keyword/pattern mapping",
      "  tester     → coverage gap per category",
      "  reviewer   → ranked probability + severity",
      "─".repeat(60),
      "  Output: regression risk table with suggested tests",
      "═".repeat(60),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
