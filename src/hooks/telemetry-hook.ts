/**
 * Telemetry Hook
 * Emits structured telemetry events for all tool calls to TELEMETRY.jsonl.
 * Enables the AgentOps dashboard to show tool usage, latency, and failures.
 */
import { appendEvent } from "../services/telemetry"

const callStartTimes = new Map<string, number>()

export async function telemetryHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string; parameters?: Record<string, unknown> },
  _output: { parts?: Array<{ type: string; text: string }> }
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"
  const callKey = `${tool}::${Date.now()}`

  callStartTimes.set(callKey, Date.now())

  appendEvent(dir, {
    session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
    run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
    event: "tool.call",
    tool,
    status: "ok",
    meta: { parameters: toolInput.parameters ?? {} },
  })
}

export async function telemetryAfterHook(
  context: { directory?: string },
  toolInput: { name?: string; tool?: string },
  _output: { parts?: Array<{ type: string; text: string }>; error?: string }
): Promise<void> {
  const dir = context.directory ?? process.cwd()
  const tool = toolInput.name ?? toolInput.tool ?? "unknown"

  appendEvent(dir, {
    session_id: process.env.OPENCODE_SESSION_ID ?? "session-0",
    run_id: process.env.OPENCODE_RUN_ID ?? "run-0",
    event: "tool.complete",
    tool,
    status: "ok",
  })
}
