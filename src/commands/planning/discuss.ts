import { readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { planningDir, statePath } from "../../tools/planning-state-lib"

export const discussCommand = {
  name: "discuss",
  description:
    "Extract requirements via @discusser Q&A — saves decisions to .planning/phases/phase-N/DISCUSS.md with D-XX numbering",
  async execute(context, args?: { topic?: string }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)
    const pd = planningDir(dir)

    // Check if project initialized
    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first to initialize the project.",
        code: "NOT_INITIALIZED",
      }
    }

    // Read STATE.md to get current phase
    const stateContent = readFileSync(sp, "utf-8")
    const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
    if (!phaseMatch) {
      return { error: "No phase found in STATE.md. Project may be corrupted." }
    }
    const phase = parseInt(phaseMatch[1], 10)

    // Check if PROJECT.md exists
    const projectPath = join(pd, "PROJECT.md")
    if (!existsSync(projectPath)) {
      return { error: "PROJECT.md not found. Run /new-project first." }
    }

    // Create phase directory if needed
    const phaseDir = join(pd, "phases", `phase-${phase}`)
    if (!existsSync(phaseDir)) {
      mkdirSync(phaseDir, { recursive: true })
    }

    // D-05: Load PROJECT.md + STATE.md, invoke @discusser
    // The command delegates to discuss-flow.md workflow
    // This handler validates prerequisites and invokes the workflow

    return {
      success: true,
      message: `Discuss phase started for phase ${phase}.`,
      topic: args?.topic ?? "general",
      workflow: "discuss-flow.md",
      phase_dir: phaseDir,
      next_step:
        "Review workflow output and respond to @discusser questions",
    }
  },
}