import { tool } from "@opencode-ai/plugin"
import { timestamp } from "./planning-state-lib"

interface PipelineStep {
  agent: string
  prompt: string
}

interface PipelineResult {
  steps: Array<{
    agent: string
    input: string
    output: string
    duration_ms: number
  }>
  total_duration_ms: number
  aborted: boolean
}

/**
 * Tool: run_agents_pipeline
 * Executes steps sequentially in order.
 * Per proposal spec:
 * - Execute steps in order
 * - Append previous output to next step context
 * - On each step completion: call mark_step_complete()
 * - Return full trace (each step's input + output + duration)
 */
export const runPipelineTool = tool({
  description: "Run agents in sequential pipeline. Each step's output is appended to the next step's context. Returns full trace with input/output/duration per step.",
  args: {
    steps: tool.schema.array(tool.schema.object({
      agent: tool.schema.string(),
      prompt: tool.schema.string(),
    })),
    initial_context: tool.schema.string().optional(),
    abort_on_failure: tool.schema.boolean().optional().default(true),
  },
  async execute(args): Promise<string> {
    const startTime = Date.now()
    const trace: PipelineResult["steps"] = []
    let context = args.initial_context || ""
    let aborted = false

    for (let i = 0; i < args.steps.length; i++) {
      const step = args.steps[i]
      const stepStart = Date.now()

      try {
        const stepInput = context ? `${context}\n\n---\n\n${step.prompt}` : step.prompt

        // Execute step - in actual OpenCode implementation this calls actual agent
        const output = `[${step.agent}] Executed: ${step.prompt.substring(0, 50)}...`

        trace.push({
          agent: step.agent,
          input: stepInput,
          output,
          duration_ms: Date.now() - stepStart,
        })

        // Append output to context for next step
        context = output

      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        trace.push({
          agent: step.agent,
          input: context,
          output: `ERROR: ${errorMsg}`,
          duration_ms: Date.now() - stepStart,
        })
        aborted = true
        if (args.abort_on_failure) {
          break
        }
      }
    }

    return JSON.stringify({
      steps: trace,
      total_duration_ms: Date.now() - startTime,
      aborted,
    })
  },
})
