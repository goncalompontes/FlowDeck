import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const blastRadiusCommand = {
  name: "blast-radius",
  description: "Blast Radius Preview — show likely downstream consequences of a proposed change including hidden dependencies and fragile integration points",
  async execute(context, args?: { change?: string; depth?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    const change = args?.change || ""
    const depth = parseInt(args?.depth ?? "2", 10)
    const state = readPlanningState(dir)
    const cd = codebaseDir(dir)

    const memoryPath = join(cd, "MEMORY.json")
    let moduleCount = 0
    if (existsSync(memoryPath)) {
      try {
        const m = JSON.parse(readFileSync(memoryPath, "utf-8"))
        moduleCount = Object.keys(m.nodes ?? {}).length
      } catch { /* ignore */ }
    }

    const failuresPath = join(cd, "FAILURES.json")
    let knownFragileCount = 0
    if (existsSync(failuresPath)) {
      try {
        const f = JSON.parse(readFileSync(failuresPath, "utf-8"))
        knownFragileCount = (f.entries ?? []).filter((e: any) => e.recurrence_count >= 2).length
      } catch { /* ignore */ }
    }

    const config = {
      agents: [
        { name: "architect", role: "trace dependency graph to depth " + depth + ", flag integration points" },
        { name: "researcher", role: "identify hidden couplings, shared state, event flows" },
        { name: "tester", role: "predict test breakage categories (unit, integration, e2e)" },
      ],
      change_description: change,
      traversal_depth: depth,
      repo_memory_nodes: moduleCount,
      known_fragile_patterns: knownFragileCount,
      workflow: "blast-radius-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(58),
      "Blast Radius Preview",
      "─".repeat(58),
      `  Change:    ${change || "(describe with --change)"}`,
      `  Depth:     ${depth} hops`,
      `  Graph:     ${moduleCount} nodes in Repo Memory`,
      `  Fragile:   ${knownFragileCount} recurring failure patterns`,
      "─".repeat(58),
      "  architect  → dependency traversal + integration risk",
      "  researcher → hidden couplings, shared state",
      "  tester     → predicted test breakage",
      "─".repeat(58),
      "  Output: blast-radius report with downstream consequence map",
      "═".repeat(58),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
