import { tool } from "@opencode-ai/plugin"
import type { OpencodeClient } from "@opencode-ai/sdk"

interface PipelineStep {
  agent: string
  prompt: string
}

interface StepTrace {
  agent: string
  session_id?: string
  input: string
  output: string
  duration_ms: number
  success: boolean
}

function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(p => p.type === "text" && typeof p.text === "string")
    .map(p => p.text as string)
    .join("\n")
}

export function createRunPipelineTool(client: OpencodeClient) {
  return tool({
    description: "Run agents in sequential pipeline. Each step's output is appended to the next step's context. One fresh child session per step. Returns full trace with session ID, input/output/duration per step.",
    args: {
      steps: tool.schema.array(tool.schema.object({
        agent: tool.schema.string(),
        prompt: tool.schema.string(),
      })),
      initial_context: tool.schema.string().optional(),
      abort_on_failure: tool.schema.boolean().optional().default(true),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const trace: StepTrace[] = []
      let carryContext = args.initial_context ?? ""
      let aborted = false

      for (const step of args.steps) {
        if (context.abort.aborted) {
          aborted = true
          break
        }

        const stepStart = Date.now()
        const stepInput = carryContext
          ? `${carryContext}\n\n---\n\n${step.prompt}`
          : step.prompt

        // Fresh session per step — prevents cumulative hidden state
        const createRes = await client.session.create({
          body: { parentID: context.sessionID, title: `${step.agent}-pipeline` },
          query: { directory: context.directory },
        })

        if (createRes.error || !createRes.data?.id) {
          const errMsg = `Failed to create session: ${(createRes.error as any)?.detail ?? "unknown"}`
          trace.push({ agent: step.agent, input: stepInput, output: errMsg, duration_ms: Date.now() - stepStart, success: false })
          aborted = true
          break
        }

        const childId = createRes.data.id

        const promptRes = await client.session.prompt({
          path: { id: childId },
          body: {
            agent: step.agent,
            parts: [{ type: "text", text: stepInput }],
            tools: { question: false },
          },
          query: { directory: context.directory },
        })

        if (promptRes.error) {
          const errMsg = `Prompt failed: ${(promptRes.error as any)?.detail ?? "unknown"}`
          trace.push({ agent: step.agent, session_id: childId, input: stepInput, output: errMsg, duration_ms: Date.now() - stepStart, success: false })
          if (args.abort_on_failure) { aborted = true; break }
          continue
        }

        const info = promptRes.data?.info
        if (info?.error) {
          const errMsg = `Agent error: ${JSON.stringify(info.error)}`
          trace.push({ agent: step.agent, session_id: childId, input: stepInput, output: errMsg, duration_ms: Date.now() - stepStart, success: false })
          if (args.abort_on_failure) { aborted = true; break }
          continue
        }

        const output = extractText((promptRes.data?.parts ?? []) as Array<{ type: string; text?: string }>)
        trace.push({ agent: step.agent, session_id: childId, input: stepInput, output: output || "(no text output)", duration_ms: Date.now() - stepStart, success: true })

        // Pass this step's output as context to the next step
        carryContext = output
      }

      return JSON.stringify({
        steps: trace,
        total_duration_ms: Date.now() - startTime,
        aborted,
      })
    },
  })
}
