/**
 * Session Idle Hook
 * Fires when OpenCode's session becomes idle (task completed).
 * 1. Sends a desktop notification (if notify() succeeds)
 * 2. Logs a summary of edited files via client.app.log
 *
 * Inspired by oh-my-openagent's session notification + ECC's session.idle handler.
 */

import { notifySessionIdle } from "./notifications"
import type { SessionFileTracker } from "./file-tracker"

export function createSessionIdleHook(
  client: { app: { log: (args: { body: { service: string; level: "info" | "warn" | "error" | "debug"; message: string } }) => Promise<any> } },
  tracker: SessionFileTracker,
) {


  return async () => {
    // Desktop notification — best-effort
    notifySessionIdle()

    // Log edited file summary
    const edited = tracker.getEditedPaths()
    if (edited.length === 0) return

    const summary = `[FlowDeck] Session idle — ${edited.length} file(s) modified this session`
    await client.app.log({ body: { service: "flowdeck", level: "info", message: summary } }).catch(() => {})

    // Log each file (up to 10 to avoid spam)
    const preview = edited.slice(0, 10)
    for (const f of preview) {
      await client.app.log({ body: { service: "flowdeck", level: "info", message: `  • ${f}` } }).catch(() => {})
    }
    if (edited.length > 10) {
      await client.app.log({ body: { service: "flowdeck", level: "info", message: `  … and ${edited.length - 10} more` } }).catch(() => {})
    }

    // Clear for next task
    tracker.clear()
  }
}
