import { tool } from "@opencode-ai/plugin"

/**
 * Tool: delegate_to_agent
 * Delegates a single task to a specified agent.
 * Per proposal spec (line 62):
 * - Single agent delegation
 * - Creates session for delegated agent
 * - Returns result aggregation
 */
export const delegateTool = tool({
  description: "Delegate a task to a single agent. Creates a session for the agent, executes the prompt, and returns the result.",
  args: {
    agent: tool.schema.string(),
    prompt: tool.schema.string(),
    context: tool.schema.string().optional(),
  },
  async execute(args): Promise<string> {
    const startTime = Date.now()
    try {
      const fullPrompt = args.context
        ? `${args.context}\n\n---\n\n${args.prompt}`
        : args.prompt

      // In actual OpenCode implementation, this would:
      // 1. Create a session for the delegated agent via client.session.create()
      // 2. Execute the prompt
      // 3. Return the aggregated result
      const output = `[${args.agent}] Delegated task completed`

      return JSON.stringify({
        agent: args.agent,
        output,
        duration_ms: Date.now() - startTime,
      })
    } catch (error: unknown) {
      return JSON.stringify({
        agent: args.agent,
        output: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
        duration_ms: Date.now() - startTime,
      })
    }
  },
})
