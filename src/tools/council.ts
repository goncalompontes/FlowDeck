import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"

export function createCouncilTool(client: OpencodeClient): ToolDefinition {
  return tool({
    description: "Run an ensemble of agents (Council) on the same task to reach consensus or compare approaches. Runs 3 specialized agents in parallel and returns their synthesized outputs.",
    args: {
      task: tool.schema.string(),
      agents: tool.schema.array(tool.schema.string()).optional(),
    },
    async execute(args, context) {
      const agents = args.agents || ["architect", "reviewer", "coder"]
      const tasks = agents.map(agent => ({
        agent,
        prompt: `TASK: ${args.task}\n\nPlease provide your best analysis/implementation for this task. Your output will be compared with other agents in a council.`,
      }))

      // Reuse the parallel execution logic (internal call or similar)
      // For simplicity, we'll implement it directly here to avoid complex imports
      const results = await Promise.all(tasks.map(async (task) => {
        const createRes = await client.session.create({
          body: { parentID: context.sessionID, title: `Council: ${task.agent}` },
          query: { directory: context.directory },
        })

        if (createRes.error || !createRes.data?.id) {
          return { agent: task.agent, error: "Failed to create session" }
        }

        const childId = createRes.data.id
        const promptRes = await client.session.prompt({
          path: { id: childId },
          body: {
            agent: task.agent,
            parts: [{ type: "text", text: task.prompt }],
          },
          query: { directory: context.directory },
        })

        const output = (promptRes.data?.parts ?? [])
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("\n")

        return { agent: task.agent, output: output || "(no output)" }
      }))

      const synthesisPrompt = `You are a Council Synthesizer. Below are the outputs from ${results.length} different agents on the same task.
      
TASK: ${args.task}

${results.map(r => `--- AGENT: ${r.agent} ---\n${r.output}`).join("\n\n")}

Please synthesize these results. Identify areas of agreement, resolve conflicts, and recommend the best path forward.`

      const finalRes = await client.session.prompt({
        path: { id: context.sessionID },
        body: {
          agent: "orchestrator",
          parts: [{ type: "text", text: synthesisPrompt }],
        },
        query: { directory: context.directory },
      })

      return (finalRes.data?.parts ?? [])
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n")
    },
  })
}
