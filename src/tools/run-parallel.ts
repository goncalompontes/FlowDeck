import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"

interface ParallelResult {
  agent: string
  session_id?: string
  success: boolean
  output?: string
  error?: string
  duration_ms: number
}

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

export function createRunParallelTool(client: OpencodeClient): ToolDefinition {
  return tool({
    description: "Run multiple agents in parallel. All tasks execute simultaneously via child sessions. Returns combined results with per-agent wall time. Partial results returned on failure.",
    args: {
      tasks: tool.schema.array(tool.schema.object({
        agent: tool.schema.string(),
        prompt: tool.schema.string(),
        context: tool.schema.string().optional(),
      })),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const childSessionIds: string[] = []

      // Abort all child sessions when parent is cancelled
      context.abort.addEventListener("abort", () => {
        for (const id of childSessionIds) {
          client.session.abort({
            path: { id },
            query: { directory: context.directory },
          }).catch(() => {/* best-effort */})
        }
      })

      const promises = args.tasks.map(async (task): Promise<ParallelResult> => {
        const taskStart = Date.now()

        // Create a child session scoped to this task
        const createRes = await client.session.create({
          body: { parentID: context.sessionID, title: `${task.agent}-subtask` },
          query: { directory: context.directory },
        })

        if (createRes.error || !createRes.data?.id) {
          return {
            agent: task.agent,
            success: false,
            error: `Failed to create session: ${(createRes.error as any)?.detail ?? "unknown"}`,
            duration_ms: Date.now() - taskStart,
          }
        }

        const childId = createRes.data.id
        childSessionIds.push(childId)

        const fullPrompt = task.context
          ? `${task.context}\n\n---\n\n${task.prompt}`
          : task.prompt

        const promptRes = await client.session.prompt({
          path: { id: childId },
          body: {
            agent: task.agent,
            parts: [{ type: "text", text: fullPrompt }],
            tools: { question: false },
          },
          query: { directory: context.directory },
        })

        // Surface both transport-level and agent-level errors
        if (promptRes.error) {
          return {
            agent: task.agent,
            session_id: childId,
            success: false,
            error: `Prompt failed: ${(promptRes.error as any)?.detail ?? "unknown"}`,
            duration_ms: Date.now() - taskStart,
          }
        }

        const info = promptRes.data?.info
        if (info?.error) {
          return {
            agent: task.agent,
            session_id: childId,
            success: false,
            error: `Agent error: ${JSON.stringify(info.error)}`,
            duration_ms: Date.now() - taskStart,
          }
        }

        const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)

        return {
          agent: task.agent,
          session_id: childId,
          success: true,
          output: output || "(no text output)",
          duration_ms: Date.now() - taskStart,
        }
      })

      const settled = await Promise.allSettled(promises)
      const results: ParallelResult[] = settled.map((result, i) => {
        if (result.status === "fulfilled") return result.value
        return {
          agent: args.tasks[i].agent,
          success: false,
          error: result.reason?.message || String(result.reason),
          duration_ms: Date.now() - startTime,
        }
      })

      return JSON.stringify({
        results,
        total_duration_ms: Date.now() - startTime,
        failures: results.filter(r => !r.success).map(r => r.agent),
      })
    },
  })
}
