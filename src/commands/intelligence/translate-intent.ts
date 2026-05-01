import { existsSync } from "fs"
import { statePath, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const translateIntentCommand = {
  name: "translate-intent",
  description: "Intent-to-Change Translator — converts vague requests like 'make checkout faster' into concrete, ranked implementation options with tradeoffs before coding starts",
  async execute(context, args?: { intent?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    if (!args?.intent) {
      return {
        error: "No intent provided. Use: /translate-intent {\"intent\": \"make checkout faster\"}",
        code: "NO_INTENT",
        hint: "Describe what you want in plain language",
      }
    }

    const state = readPlanningState(dir)

    const config = {
      intent: args.intent,
      agents: [
        { name: "architect", role: "decompose intent into ≤5 concrete implementation options" },
        { name: "researcher", role: "fetch relevant codebase context and prior art for each option" },
        { name: "reviewer", role: "rank options by impact/effort/risk and identify tradeoffs" },
      ],
      output_format: {
        options: "ranked list with: name, description, files_affected, effort (S/M/L), risk (low/med/high), tradeoffs",
        recommendation: "top option with rationale",
        clarifying_questions: "list any ambiguities that need user input before proceeding",
      },
      workflow: "translate-intent-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(60),
      "Intent-to-Change Translator",
      "─".repeat(60),
      `  Intent: "${args.intent}"`,
      "─".repeat(60),
      "  architect  → decompose into ≤5 concrete options",
      "  researcher → fetch codebase context + prior art",
      "  reviewer   → rank by impact / effort / risk",
      "─".repeat(60),
      "  Output: ranked options table with tradeoffs + recommendation",
      "═".repeat(60),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
