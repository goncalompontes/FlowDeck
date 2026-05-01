import { readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { planningDir, statePath } from "../../tools/planning-state-lib"
import { runImpactRadar } from "../../lib/impact-radar"

export const discussCommand = {
  name: "fd-discuss",
  description:
    "Extract requirements via @discusser Q&A — saves decisions to .planning/phases/phase-N/DISCUSS.md with D-XX numbering",
  async execute(context, args?: { topic?: string }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)
    const pd = planningDir(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first to initialize the project.",
        code: "NOT_INITIALIZED",
      }
    }

    const stateContent = readFileSync(sp, "utf-8")
    const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
    if (!phaseMatch) {
      return { error: "No phase found in STATE.md. Project may be corrupted." }
    }
    const phase = parseInt(phaseMatch[1], 10)

    const projectPath = join(pd, "PROJECT.md")
    if (!existsSync(projectPath)) {
      return { error: "PROJECT.md not found. Run /new-project first." }
    }

    const phaseDir = join(pd, "phases", `phase-${phase}`)
    if (!existsSync(phaseDir)) {
      mkdirSync(phaseDir, { recursive: true })
    }

    const topic = args?.topic ?? "general"
    const radar = runImpactRadar(dir, topic)

    return {
      success: true,
      message: `Discuss phase started for phase ${phase}.`,
      topic,
      workflow: "discuss-flow.md",
      phase_dir: phaseDir,
      impact_radar: radar,
      next_step: radar.risk_flag
        ? "Review impact_radar risks before finalizing decisions with @discusser"
        : "Review workflow output and respond to @discusser questions",
    }
  },
}
