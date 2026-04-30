import { appendFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, parseState } from "../tools/planning-state-lib"

const LOG_DIR = ".opencode"
const LOG_FILE = "flowdeck.log"

/**
 * HOOK-02: Idle and error session notifications
 * Writes JSON Lines entries to .opencode/flowdeck.log and outputs to terminal.
 */
export async function sessionEventsHook(
  ctx: { directory: string },
  eventType: "idle" | "error"
): Promise<void> {
  const logDir = join(ctx.directory, LOG_DIR)
  const logPath = join(logDir, LOG_FILE)

  // Ensure log directory exists
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  const phase = getPhase(ctx.directory)
  const timestamp = new Date().toISOString()
  const detail =
    eventType === "idle"
      ? "Session is idle. Run /checkpoint to save state."
      : "Session encountered an error."

  // Write to terminal
  process.stdout.write(`[flowdeck] ${eventType}: ${detail}\n`)

  // Write JSON Lines entry to .opencode/flowdeck.log
  const entry = { timestamp, event: eventType, phase, detail }
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8")
}

/**
 * Read current phase from STATE.md. Returns null if unreadable.
 */
function getPhase(directory: string): string | null {
  try {
    const stateFilePath = statePath(directory)
    const content = readFileSync(stateFilePath, "utf-8")
    const state = parseState(content)
    const currentPhase = (state["current_phase"] || {}) as Record<string, unknown>
    return (currentPhase["phase"] as string) ?? null
  } catch {
    return null
  }
}