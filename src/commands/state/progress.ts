import { existsSync, readFileSync } from "fs"
import { statePath, planningDir, phasePlanPath, resultPath, parseState, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const progressCommand = {
  name: "progress",
  description: "Display STATE.md, active PLAN.md, and recent RESULT.md files",
  async execute(context, args?: { json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Initialize project first with /new-project.",
        code: "NOT_INITIALIZED",
        hint: "Run /new-project to initialize the project"
      }
    }

    const stateContent = readFileSync(sp, "utf-8")
    const state = parseState(stateContent)

    const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
    const phase = phaseMatch ? parseInt(phaseMatch[1], 10) : 1

    let planContent = null
    const planPath = phasePlanPath(dir, phase)
    if (existsSync(planPath)) {
      planContent = readFileSync(planPath, "utf-8")
    }

    const recentResults: Array<{phase: number, content: string}> = []
    for (let p = Math.max(1, phase - 2); p <= phase; p++) {
      const rp = resultPath(dir, p)
      if (existsSync(rp)) {
        recentResults.push({ phase: p, content: readFileSync(rp, "utf-8") })
      }
    }

    const output = {
      state: state,
      phase,
      plan_preview: planContent ? planContent.substring(0, 500) : null,
      recent_results: recentResults.map(r => ({
        phase: r.phase,
        preview: r.content.substring(0, 200)
      })),
      last_updated: state.last_updated || timestamp()
    }

    if (args?.json) {
      return {
        success: true,
        data: output,
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const tableLines = [
      "═".repeat(60),
      `Phase: ${phase}  |  Status: ${state.status || "unknown"}  |  Updated: ${output.last_updated}`,
      "─".repeat(60),
    ]

    if (planContent) {
      const stepsComplete = (stateContent.match(/steps_complete:\s*\[([^\]]*)\]/)?.[1] || "").split(",").filter(s => s.trim()).length
      const totalSteps = (planContent.match(/Step\s+\d+/g) || []).length
      tableLines.push(`Plan: ${totalSteps} steps (${stepsComplete} complete)`)
    } else {
      tableLines.push("Plan: No active plan")
    }

    if (recentResults.length > 0) {
      tableLines.push(`Recent results: ${recentResults.map(r => `Phase ${r.phase}`).join(", ")}`)
    }

    tableLines.push("═".repeat(60))

    return {
      success: true,
      message: tableLines.join("\n"),
      data: output,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}
