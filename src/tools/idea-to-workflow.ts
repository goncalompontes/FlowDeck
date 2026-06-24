import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { buildWorkflow } from "../services/idea-workflow-builder"

export const ideaToWorkflowTool: ToolDefinition = tool({
  description:
    "Convert a vague idea into a structured workflow with phases, agent assignments, and dependency maps.",
  args: {
    idea: tool.schema.string(),
  },
  async execute(args, context) {
    const dir = context.directory ?? process.cwd()
    try {
      const result = await buildWorkflow(args.idea, { directory: dir })
      return JSON.stringify(result)
    } catch (err) {
      return JSON.stringify({
        error: true,
        message: err instanceof Error ? err.message : "Unknown error building workflow",
      })
    }
  },
})
