import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { planningDir, statePath, phasePlanPath, timestamp, codebaseDir } from "../../tools/planning-state-lib"
import { confirmPrompt } from "../../lib/confirmation"

function buildImpactRadarSection(dir: string, changeText: string): string {
  const cd = codebaseDir(dir)
  const lower = changeText.toLowerCase()
  const words = lower.split(/\s+/).filter(w => w.length > 3)

  const lines: string[] = ["## Change Impact Radar", ""]

  let hasAny = false

  // Volatility hotspots
  const volatilityPath = join(cd, "VOLATILITY.json")
  if (existsSync(volatilityPath)) {
    try {
      const v = JSON.parse(readFileSync(volatilityPath, "utf-8"))
      const hits = (v.entries ?? []).filter((e: any) =>
        (e.stability === "volatile" || e.stability === "critical") &&
        words.some(w => e.path.toLowerCase().includes(w))
      )
      if (hits.length > 0) {
        hasAny = true
        lines.push("### Volatile Zones Touched")
        for (const h of hits) lines.push(`- \`${h.path}\` — ${h.stability}`)
        lines.push("")
      }
    } catch { /* ignore */ }
  }

  // Known failures related to this change
  const failuresPath = join(cd, "FAILURES.json")
  if (existsSync(failuresPath)) {
    try {
      const f = JSON.parse(readFileSync(failuresPath, "utf-8"))
      const relevant = (f.entries ?? []).filter((e: any) =>
        !e.tags?.includes("resolved") &&
        words.some(w => (e.description ?? "").toLowerCase().includes(w))
      )
      if (relevant.length > 0) {
        hasAny = true
        lines.push("### Known Failures (Unresolved)")
        for (const e of relevant.slice(0, 5)) {
          lines.push(`- **${e.id}** (×${e.recurrence_count}): ${e.description.substring(0, 80)}`)
        }
        lines.push("")
      }
    } catch { /* ignore */ }
  }

  // Architecture memory nodes
  const memoryPath = join(cd, "MEMORY.json")
  if (existsSync(memoryPath)) {
    try {
      const m = JSON.parse(readFileSync(memoryPath, "utf-8"))
      const nodes = Object.values(m.nodes ?? {}) as any[]
      const hits = nodes.filter(n => words.some(w => (n.path ?? "").toLowerCase().includes(w)))
      if (hits.length > 0) {
        hasAny = true
        lines.push("### Related Architecture Nodes")
        for (const n of hits.slice(0, 8)) lines.push(`- \`${n.path}\` (${n.type})${n.owner ? ` — owner: ${n.owner}` : ""}`)
        lines.push("")
      }
    } catch { /* ignore */ }
  }

  if (!hasAny) {
    lines.push("_No volatility or failure signals found for this change. Proceed with standard review._")
    lines.push("")
  }

  return lines.join("\n")
}

export const planCommand = {
  name: "plan",
  description: "Create detailed implementation plan from DISCUSS.md decisions — save PLAN.md, update STATE.md, require CONFIRM before execution",
  async execute(context, args?: { phase?: string; confirm?: boolean; json?: boolean; yes?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)
    const pd = planningDir(dir)

    if (!existsSync(sp)) {
      return {
        error: "STATE.md not found. Run /new-project first.",
        code: "NOT_INITIALIZED",
      }
    }

    const stateContent = readFileSync(sp, "utf-8")
    const confirmedMatch = stateContent.match(/^plan_confirmed:\s*(true|false)/m)
    const isConfirmed = confirmedMatch && confirmedMatch[1] === "true"

    // Get phase number
    let phase: number
    if (args?.phase) {
      phase = parseInt(args.phase, 10)
    } else {
      const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
      if (!phaseMatch) {
        return { error: "No phase found in STATE.md." }
      }
      phase = parseInt(phaseMatch[1], 10)
    }

    // Check for DISCUSS.md
    const discussPath = join(pd, "phases", `phase-${phase}`, "DISCUSS.md")
    if (!existsSync(discussPath)) {
      return {
        error: "DISCUSS.md not found. Run /discuss [topic] first to capture decisions.",
        code: "NO_DISCUSS",
        hint: `No DISCUSS.md found for phase ${phase}`,
      }
    }

    // --yes flag bypasses confirmation
    if (args?.yes && !isConfirmed) {
      args = { ...args, confirm: true }
    }

    // If NOT_CONFIRMED and no explicit confirm flag, present for CONFIRM
    if (!isConfirmed && !args?.confirm) {
      const discussContent = readFileSync(discussPath, "utf-8")
      const decisions = (discussContent.match(/^D-\d+/gm) || []).length
      const lines = discussContent.split("\n").slice(0, 50)

      const preview = [
        "═".repeat(55),
        `PLAN PHASE ${phase} — AWAITING CONFIRMATION`,
        "═".repeat(55),
        "",
        `DISCUSS.md: ${discussPath}`,
        `Decisions found: ${decisions}`,
        "",
        "Preview:",
        ...lines.map(l => `  ${l}`),
        "",
        "─".repeat(55),
        "Type CONFIRM to save PLAN.md and enable execution",
        "═".repeat(55),
      ]

      return {
        ...confirmPrompt("plan-confirm", preview.join("\n")),
        phase,
        decisions_found: decisions,
        workflow: "plan-flow.md",
        next_step: "Type CONFIRM to save, or run /discuss to modify decisions first"
      }
    }

    // User confirmed — generate and save PLAN.md
    const discussContent = readFileSync(discussPath, "utf-8")
    const planFile = phasePlanPath(dir, phase)

    // Parse decisions from DISCUSS.md
    const decisionLines: string[] = []
    const inDecisions = false
    let currentDecision = ""

    for (const line of discussContent.split("\n")) {
      const dm = line.match(/^(D-\d+):\s+(.+)/)
      if (dm) {
        currentDecision = `${dm[1]}: ${dm[2]}`
        decisionLines.push(currentDecision)
      }
    }

    // Generate PLAN.md content
    const changeDescription = decisionLines.join("; ").substring(0, 200)
    const impactRadarSection = buildImpactRadarSection(dir, changeDescription)

    const planContent = [
      "# Implementation Plan",
      "",
      `**Phase:** ${phase}`,
      `**Created:** ${timestamp()}`,
      `**Source:** DISCUSS.md (${decisionLines.length} decisions)`,
      "",
      "## Decisions",
      "",
      ...decisionLines.map(d => `- ${d}`),
      "",
      impactRadarSection,
      "## Steps",
      "",
      "- [ ] Step 1: [Implementation step]",
      "- [ ] Step 2: [Implementation step]",
      "- [ ] Step 3: [Implementation step]",
      "",
      "## Acceptance Criteria",
      "",
      "- [ ] Criterion 1",
      "- [ ] Criterion 2",
      "",
      "## Status",
      "",
      "CONFIRMED",
    ].join("\n")

    // Ensure phase directory exists
    const phaseDir = join(pd, "phases", `phase-${phase}`)
    if (!existsSync(phaseDir)) {
      mkdirSync(phaseDir, { recursive: true })
    }

    writeFileSync(planFile, planContent, "utf-8")

    // Update STATE.md with plan_confirmed
    let state = readFileSync(sp, "utf-8")
    state = state.replace(/^plan_confirmed:\s*.*/m, "plan_confirmed: true")
    state = state.replace(/^confirmed_at:\s*.*/m, `confirmed_at: ${timestamp()}`)
    state = state.replace(/^status:\s*.*/m, "status: in_progress")
    writeFileSync(sp, state, "utf-8")

    return {
      success: true,
      message: `PLAN.md saved for phase ${phase}. Execution enabled.`,
      phase,
      decisions_count: decisionLines.length,
      plan_file: planFile,
      status: "CONFIRMED"
    }
  }
}
