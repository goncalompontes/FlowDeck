import { readFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { planningDir, statePath, codebaseDir } from "../../tools/planning-state-lib"

function loadImpactRadarContext(dir: string, topic: string): {
  hotspots: Array<{ path: string; stability: string }>
  knownFailures: Array<{ id: string; description: string; affected_paths: string[] }>
  memoryNodes: string[]
} {
  const cd = codebaseDir(dir)
  const lower = topic.toLowerCase()

  // Load volatility hotspots relevant to the topic
  const hotspots: Array<{ path: string; stability: string }> = []
  const volatilityPath = join(cd, "VOLATILITY.json")
  if (existsSync(volatilityPath)) {
    try {
      const v = JSON.parse(readFileSync(volatilityPath, "utf-8"))
      for (const e of v.entries ?? []) {
        if (e.stability === "volatile" || e.stability === "critical") {
          const pathLower = e.path.toLowerCase()
          const words = lower.split(/\s+/)
          if (words.some((w: string) => w.length > 3 && pathLower.includes(w))) {
            hotspots.push({ path: e.path, stability: e.stability })
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Load known failures related to the topic
  const knownFailures: Array<{ id: string; description: string; affected_paths: string[] }> = []
  const failuresPath = join(cd, "FAILURES.json")
  if (existsSync(failuresPath)) {
    try {
      const f = JSON.parse(readFileSync(failuresPath, "utf-8"))
      for (const e of f.entries ?? []) {
        if (!e.tags?.includes("resolved")) {
          const descLower = (e.description ?? "").toLowerCase()
          const words = lower.split(/\s+/)
          if (words.some((w: string) => w.length > 3 && descLower.includes(w))) {
            knownFailures.push({ id: e.id, description: e.description, affected_paths: e.affected_paths ?? [] })
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Load relevant memory nodes
  const memoryNodes: string[] = []
  const memoryPath = join(cd, "MEMORY.json")
  if (existsSync(memoryPath)) {
    try {
      const m = JSON.parse(readFileSync(memoryPath, "utf-8"))
      for (const node of Object.values(m.nodes ?? {}) as any[]) {
        const pathLower = (node.path ?? "").toLowerCase()
        const words = lower.split(/\s+/)
        if (words.some((w: string) => w.length > 3 && pathLower.includes(w))) {
          memoryNodes.push(node.path)
        }
      }
    } catch { /* ignore */ }
  }

  return { hotspots, knownFailures, memoryNodes }
}

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

    // Run impact radar scan on the discussion topic
    const topic = args?.topic ?? "general"
    const radarData = loadImpactRadarContext(dir, topic)
    const hasRisks = radarData.hotspots.length > 0 || radarData.knownFailures.length > 0

    return {
      success: true,
      message: `Discuss phase started for phase ${phase}.`,
      topic,
      workflow: "discuss-flow.md",
      phase_dir: phaseDir,
      impact_radar: {
        hotspots: radarData.hotspots,
        known_failures: radarData.knownFailures,
        related_modules: radarData.memoryNodes,
        risk_flag: hasRisks,
        advisory: hasRisks
          ? `⚠ Impact Radar: ${radarData.hotspots.length} volatile zone(s) and ${radarData.knownFailures.length} known failure(s) relate to this topic. Review before finalizing decisions.`
          : null,
      },
      next_step: hasRisks
        ? "Review impact_radar risks before confirming decisions with @discusser"
        : "Review workflow output and respond to @discusser questions",
    }
  },
}