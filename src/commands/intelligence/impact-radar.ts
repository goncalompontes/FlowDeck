import type { CommandContext } from "../../types/command-context"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { scorePatch } from "../../hooks/patch-trust"

export const impactRadarCommand = {
  name: "fd-impact-radar",
  description: "Change Impact Radar — predict which files, modules, APIs, tests, and DB paths are likely affected before the AI edits anything",
  async execute(context: CommandContext, args?: { change?: string; scope?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    const change = args?.change || ""
    const scope = args?.scope || "all"
    const state = readPlanningState(dir)
    const cd = codebaseDir(dir)

    // Load architecture context for the radar agents
    const archPath = join(cd, "ARCHITECTURE.md")
    const stackPath = join(cd, "STACK.md")
    const architectureContext = existsSync(archPath) ? readFileSync(archPath, "utf-8").substring(0, 800) : null
    const stackContext = existsSync(stackPath) ? readFileSync(stackPath, "utf-8").substring(0, 400) : null

    const volatilityPath = join(cd, "VOLATILITY.json")
    let hotspots: string[] = []
    if (existsSync(volatilityPath)) {
      try {
        const v = JSON.parse(readFileSync(volatilityPath, "utf-8"))
        hotspots = (v.entries ?? [])
          .filter((e: any) => e.stability === "volatile" || e.stability === "critical")
          .map((e: any) => e.path)
          .slice(0, 10)
      } catch { /* ignore */ }
    }

    const config = {
      agents: [
        { name: "researcher", role: "trace dependency graph from changed paths" },
        { name: "architect", role: "identify API contracts and service boundaries at risk" },
        { name: "tester", role: "find test files that cover the affected paths" },
      ],
      change_description: change,
      scope,
      architecture_context: architectureContext,
      stack_context: stackContext,
      known_hotspots: hotspots,
    }

    const workflow = "impact-radar-flow.md"

    if (args?.json) {
      return { success: true, data: { workflow, config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(58),
      "Change Impact Radar",
      "─".repeat(58),
      `  Change: ${change || "(describe with --change)"}`,
      `  Scope:  ${scope}`,
      `  Hotspot files tracked: ${hotspots.length}`,
      "─".repeat(58),
      "  researcher  → dependency graph scan",
      "  architect   → API / service boundary risk",
      "  tester      → affected test coverage",
      "─".repeat(58),
      "  Outputs: affected files, APIs, tests, DB paths",
      "═".repeat(58),
    ]

    return { success: true, message: lines.join("\n"), workflow, config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
