import { existsSync } from "fs"
import { statePath, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const translateIntentCommand = {
  name: "fd-translate-intent",
  description: "Intent-to-Change Translator — converts vague requests like 'make checkout faster' into 3–5 concrete, ranked implementation options with tradeoffs, assumptions, and clarifying questions",
  async execute(context: any, args?: { intent?: string; "rank-options"?: boolean; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /fd-new-project first.", code: "NOT_INITIALIZED" }
    }

    if (!args?.intent) {
      return {
        error: "No intent provided. Use: /fd-translate-intent --intent \"make checkout faster\"",
        code: "NO_INTENT",
        hint: "Describe what you want in plain language",
      }
    }

    const state = readPlanningState(dir)

    const config = {
      intent: args.intent,
      agents: [
        { name: "architect", role: "decompose intent into 3–5 concrete implementation options, each with name, description, files_affected, effort (S/M/L), risk (low/med/high), and tradeoffs" },
        { name: "researcher", role: "fetch relevant codebase context, prior art, and constraints for each option" },
        { name: "reviewer", role: "rank options by impact/effort/risk; select recommended option; list assumptions and clarifying questions" },
      ],
      output_format: {
        options: "ranked list (1–5) with: name, description, files_affected, effort, risk, tradeoffs",
        recommended_option: "index of recommended option with rationale (e.g. 'Option 2 — best risk/effort ratio')",
        assumptions: "list of assumptions made about the codebase, user intent, or constraints",
        clarifying_questions: "list any ambiguities that need user input before proceeding",
      },
      rank_options: args["rank-options"] !== false,
      workflow: "translate-intent-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(62),
      "fd-translate-intent",
      "─".repeat(62),
      `  Intent: "${args.intent}"`,
      "─".repeat(62),
      "  architect  → decompose into 3–5 concrete options",
      "  researcher → fetch codebase context + prior art",
      "  reviewer   → rank by impact/effort/risk",
      "─".repeat(62),
      "  Output:",
      "    • ranked options table (name, effort, risk, tradeoffs)",
      "    • recommended option with rationale",
      "    • assumptions the agent made",
      "    • clarifying questions if intent is ambiguous",
      "═".repeat(62),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
