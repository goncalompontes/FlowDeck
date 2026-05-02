import type { CommandContext } from "../../types/command-context"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, planningDir, phasePlanPath, timestamp, parseState } from "../../tools/planning-state-lib"
import { confirmPrompt, skipResponse } from "../../lib/confirmation"

export const resumeCommand = {
  name: "fd-resume",
  description: "Reload STATE.md + last PLAN.md + DISCUSS.md — brief user, PAUSE for confirmation, then continue from where stopped",
  async execute(context: CommandContext, args?: { confirm?: boolean; json?: boolean; yes?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)
    const pd = planningDir(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first to initialize the project.",
        code: "NOT_INITIALIZED"
      }
    }

    const stateContent = readFileSync(sp, "utf-8")
    const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
    if (!phaseMatch) {
      return {
        error: "No phase found in STATE.md. Project may be corrupted.",
        code: "CORRUPTED"
      }
    }
    const phase = parseInt(phaseMatch[1], 10)

    const state = parseState(stateContent)
    const planFile = (state as any).plan_file || phasePlanPath(dir, phase)
    const discussFile = join(pd, "phases", `phase-${phase}`, "DISCUSS.md")

    let planContent = null
    let discussContent = null

    if (existsSync(planFile)) {
      planContent = readFileSync(planFile, "utf-8")
    }

    if (existsSync(discussFile)) {
      discussContent = readFileSync(discussFile, "utf-8")
    }

    const stepsCompleteMatch = stateContent.match(/^steps_complete:\s*\[([^\]]*)\]/m)
    const stepsComplete = stepsCompleteMatch ? stepsCompleteMatch[1].split(",").filter(s => s.trim()) : []
    const stepsPendingMatch = stateContent.match(/^steps_pending:\s*\[([^\]]*)\]/m)
    const stepsPending = stepsPendingMatch ? stepsPendingMatch[1].split(",").filter(s => s.trim()) : []

    const lastActionMatch = stateContent.match(/^last_action:\s*"?([^"\n]+)"?/m)
    const lastAction = lastActionMatch ? lastActionMatch[1] : "unknown"

    const stepsDone = stepsComplete.length
    const stepsTotal = stepsDone + stepsPending.length

    // --yes flag bypasses confirmation
    if (args?.yes) {
      args = { ...args, confirm: true }
    }

    // Silent skip when user says "no" (confirm: false)
    if (args?.confirm === false) {
      return skipResponse("session-resume")
    }

    // If not confirmed, present briefing and PAUSE
    if (!args?.confirm) {
      const briefing = [
        "═".repeat(55),
        `RESUME — Phase ${phase} Brief`,
        "═".repeat(55),
        "",
        `Last session ended at step ${stepsDone}/${stepsTotal}.`,
        "",
        `Completed (${stepsDone}):`,
        ...stepsComplete.map(s => `  ✓ Step ${s}`),
        "",
        `Next (${stepsPending.length}):`,
        ...stepsPending.slice(0, 5).map(s => `  ○ Step ${s}`),
        ...(stepsPending.length > 5 ? [`  ... and ${stepsPending.length - 5} more`] : []),
        "",
        `Last action: ${lastAction}`,
        "",
        "─".repeat(55),
        "Type CONFIRM to resume from where you left off",
        "═".repeat(55),
      ]

      return {
        success: true,
        message: briefing.join("\n"),
        position: {
          steps_done: stepsDone,
          steps_remaining: stepsPending.length,
          last_action: lastAction
        },
        status: "AWAITING_CONFIRM",
        phase,
        next_step: stepsPending[0] ? `Step ${stepsPending[0]}` : "All steps complete"
      }
    }

    // User confirmed — return full restored context
    const restored = {
      state: { phase, status: (state as any).status, steps_complete: stepsComplete, steps_pending: stepsPending },
      plan: planContent,
      discuss: discussContent,
      position: {
        steps_done: stepsDone,
        steps_remaining: stepsPending.length,
        last_action: lastAction
      }
    }

    const message = [
      `✓ Resumed phase ${phase}: ${(state as any).status}`,
      `${stepsPending.length} steps remaining`,
      `Last action: ${lastAction}`,
      `Next: Step ${stepsPending[0] || "none"}`,
    ].join(" | ")

    return {
      success: true,
      message,
      restored,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}
