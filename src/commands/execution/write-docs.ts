import type { CommandContext } from "../../types/command-context"
import { existsSync } from "fs"
import { statePath, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const writeDocsCommand = {
  name: "fd-write-docs",
  description: "Explore public APIs — writer drafts — reviewer accuracy check — writer final",
  async execute(context: CommandContext, args?: { scope?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first.",
        code: "NOT_INITIALIZED"
      }
    }

    const scope = args?.scope || "public"
    const state = readPlanningState(dir)

    if (scope.includes("/") && !scope.startsWith("./")) {
      return {
        error: "Invalid scope: absolute paths not allowed",
        code: "INVALID_SCOPE"
      }
    }

    const workflow = "write-docs-flow.md"

    const config = {
      agents: [
        { name: "writer", model: "claude-haiku-4-5", temperature: 0.6, maxSteps: 20 },
        { name: "reviewer", focus: "accuracy", check: "consistency with actual implementation" }
      ],
      phases: [
        { step: "explore", agent: "writer", action: "discover public APIs and their signatures" },
        { step: "draft", agent: "writer", action: "generate documentation draft" },
        { step: "review", agent: "reviewer", action: "verify accuracy against source code" },
        { step: "finalize", agent: "writer", action: "incorporate reviewer feedback and produce final docs" }
      ],
      scope
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
      `Write Docs: scope=${scope}`,
      `Phase ${state.phase} | 4-step workflow`,
      "─".repeat(50),
      "  [1] explore  → discover public APIs",
      "  [2] draft    → writer generates draft",
      "  [3] review   → reviewer verifies accuracy",
      "  [4] finalize → writer produces final",
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
