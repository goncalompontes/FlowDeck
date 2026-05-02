import type { CommandContext } from "../../types/command-context"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { statePath, timestamp } from "../../tools/planning-state-lib"
import { confirmPrompt } from "../../lib/confirmation"

export const checkpointCommand = {
  name: "fd-checkpoint",
  description: "Force-save current state to STATE.md — safe to close session",
  async execute(context: CommandContext, args?: { yes?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Initialize project first with /new-project." }
    }

    // If --yes flag provided, skip confirmation
    if (!args?.yes) {
      return {
        ...confirmPrompt("checkpoint-save", "Save checkpoint to STATE.md? [y/n]"),
        saved_to: sp,
      }
    }

    // Read current state
    let content = readFileSync(sp, "utf-8")

    // D-07: Update last_updated and last_action without corrupting phase history
    // Preserve existing structure — only update timestamp fields
    const updated = timestamp()

    // Update last_updated field if it exists
    if (content.includes("last_updated:")) {
      content = content.replace(/^last_updated:.*/m, `last_updated: "${updated}"`)
    }

    // Update timestamp in body if it exists
    if (content.includes("**Last updated:**")) {
      content = content.replace(/\*\*Last updated:\*\*.*/, `**Last updated:** ${updated}`)
    }

    // Append checkpoint entry to session history if section exists
    if (content.includes("## Session History")) {
      const checkpointEntry = `- ${updated} — Checkpoint saved`
      content = content.replace(/(\n## Session History\n)/, `$1${checkpointEntry}\n`)
    }

    writeFileSync(sp, content, "utf-8")

    return {
      success: true,
      message: `Checkpoint saved at ${updated}`,
      saved_to: sp,
    }
  },
}
