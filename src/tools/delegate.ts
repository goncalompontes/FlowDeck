import { tool } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

export function createDelegateTool(client: OpencodeClient) {
  return tool({
    description: "Delegate a task to a single agent via a child session. Returns the agent's output.",
    args: {
      agent: tool.schema.string(),
      prompt: tool.schema.string(),
      context: tool.schema.string().optional(),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()

      const createRes = await client.session.create({
        body: { parentID: context.sessionID, title: `${args.agent}-delegate` },
        query: { directory: context.directory },
      })

      if (createRes.error || !createRes.data?.id) {
        return JSON.stringify({
          agent: args.agent,
          success: false,
          error: `Failed to create session: ${(createRes.error as any)?.detail ?? "unknown"}`,
          duration_ms: Date.now() - startTime,
        })
      }

      const childId = createRes.data.id

      // Abort child if parent is cancelled
      context.abort.addEventListener("abort", () => {
        client.session.abort({
          path: { id: childId },
          query: { directory: context.directory },
        }).catch(() => {/* best-effort */})
      })

      const fullPrompt = args.context
        ? `${args.context}\n\n---\n\n${args.prompt}`
        : args.prompt

      const promptRes = await client.session.prompt({
        path: { id: childId },
        body: {
          agent: args.agent,
          parts: [{ type: "text", text: fullPrompt }],
          tools: { question: false },
        },
        query: { directory: context.directory },
      })

      if (promptRes.error) {
        return JSON.stringify({
          agent: args.agent,
          session_id: childId,
          success: false,
          error: `Prompt failed: ${(promptRes.error as any)?.detail ?? "unknown"}`,
          duration_ms: Date.now() - startTime,
        })
      }

      const info = promptRes.data?.info
      if (info?.error) {
        return JSON.stringify({
          agent: args.agent,
          session_id: childId,
          success: false,
          error: `Agent error: ${JSON.stringify(info.error)}`,
          duration_ms: Date.now() - startTime,
        })
      }

      const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)

      return JSON.stringify({
        agent: args.agent,
        session_id: childId,
        success: true,
        output: output || "(no text output)",
        duration_ms: Date.now() - startTime,
      })
    },
  })
}
