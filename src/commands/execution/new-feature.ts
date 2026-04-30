import { existsSync } from "fs"
import { statePath, planningDir, codebaseDir, phasePlanPath, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { codebaseStateTool } from "../../tools/codebase-state"

export const newFeatureCommand = {
  name: "new-feature",
  description: "Execute feature implementation — guard check, orchestrator coordination, parallel coder+researcher, reviewer, tester, STATE.md update",
  async execute(context, args?: { json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    // D-15: Guard check - all 3 prerequisites required
    const pd = planningDir(dir)
    const cd = codebaseDir(dir)

    const checks = {
      ".planning/": existsSync(pd),
      ".codebase/": existsSync(cd),
      "PLAN.md confirmed": () => {
        if (!existsSync(sp)) return false
        const state = readPlanningState(dir)
        return state.plan_confirmed === true
      }
    }

    const missing = Object.entries(checks).filter(([, v]) => typeof v === "boolean" ? !v : !v()).map(([k]) => k)
    if (missing.length > 0) {
      return {
        error: `Missing prerequisites: ${missing.join(", ")}`,
        code: "GUARD_FAILED",
        hint: "Run /new-project, /map-codebase, and /plan first"
      }
    }

    const state = readPlanningState(dir)
    const phase = state.phase

    const planPath = phasePlanPath(dir, phase)
    if (!existsSync(planPath)) {
      return {
        error: "PLAN.md not found. Run /plan first.",
        code: "NO_PLAN"
      }
    }

    const codebaseResult = codebaseStateTool.execute({ action: "read", files: ["STACK.md", "ARCHITECTURE.md"] }, context)

    const workflow = "execute-flow.md"

    const config = {
      orchestrator: {
        model: "claude-sonnet-4-5",
        temperature: 0.3,
        maxSteps: 60
      },
      agents: [
        { name: "coder", model: "claude-opus-4-5", temperature: 0.2, reasoningEffort: "high" },
        { name: "researcher", model: "gpt-4o", temperature: 0.5 },
        { name: "reviewer", model: "gemini-2.5-flash", temperature: 0.1 },
        { name: "tester", model: "claude-haiku-4-5", temperature: 0.1 }
      ],
      parallel: {
        coder: true,
        researcher: true,
      },
      worktree: true
    }

    if (args?.json) {
      return {
        success: true,
        data: { workflow, config, phase, plan_file: planPath },
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const tableLines = [
      "═".repeat(55),
      `New Feature: phase ${phase}`,
      "─".repeat(55),
      `  Guard: .planning/ ✓  .codebase/ ✓  plan_confirmed ✓`,
      "─".repeat(55),
      "  orchestrator → coordinates execution",
      "  parallel:     → @coder + @researcher",
      "  sequential:   → @reviewer, @tester",
      "─".repeat(55),
      `  plan: ${planPath.split("/").pop()}`,
      "═".repeat(55)
    ]

    return {
      success: true,
      message: tableLines.join("\n"),
      workflow,
      config,
      phase,
      plan_file: planPath,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}