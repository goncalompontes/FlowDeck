import { readFileSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import { planningDir, timestamp, updatePlanningState, readPlanningState } from "../../tools/planning-state-lib"
import { confirmPrompt } from "../../lib/confirmation"

export const roadmapCommand = {
  name: "fd-roadmap",
  description: "View or update project roadmap — displays ROADMAP.md, shows phase statuses, add new phase, or mark phase complete",
  async execute(context, args?: { add?: string; complete?: string; json?: boolean; dryRun?: boolean; yes?: boolean; filter?: string; search?: string; sort?: string }) {
    const dir = context.directory ?? process.cwd()
    const pd = planningDir(dir)
    const roadmapPath = join(pd, "ROADMAP.md")

    if (!existsSync(pd)) {
      return {
        error: ".planning/ not found. Run /new-project first.",
        code: "NOT_INITIALIZED"
      }
    }

    if (!existsSync(roadmapPath)) {
      return {
        error: "ROADMAP.md not found.",
        code: "NO_ROADMAP"
      }
    }

    const content = readFileSync(roadmapPath, "utf-8")

    // Handle --complete phase
    if (args?.complete) {
      const phaseNum = parseInt(args.complete, 10)
      if (isNaN(phaseNum)) {
        return { error: "Phase number must be a numeric value", code: "INVALID_PHASE" }
      }

      // Validate phase exists in ROADMAP.md
      const phaseExists = content.match(new RegExp(`\\[ \\] Phase ${phaseNum}:`))
      if (!phaseExists) {
        return { error: `Phase ${phaseNum} not found in roadmap. Check /roadmap for valid phase numbers.`, code: "PHASE_NOT_FOUND" }
      }

      // If --yes flag provided, skip confirmation and proceed directly
      if (!args?.yes) {
        return {
          ...confirmPrompt("roadmap-complete", `Mark Phase ${args.complete} complete? This will update ROADMAP.md and STATE.md. [y/n]`),
          phase: parseInt(args.complete, 10)
        }
      }

      // Mark phase as complete in ROADMAP.md
      const phasePattern = new RegExp(`(\\-\\[ \\] Phase ${phaseNum}:)`, "i")
      const completedPattern = new RegExp(`Phase ${phaseNum}: ([^\\(]+)`)
      const dateStr = new Date().toISOString().split("T")[0]

      let updated = content.replace(phasePattern, `[x] Phase ${phaseNum}:`)

      // Also update milestone if all phases complete
      const milestoneMatch = content.match(/### 📋 (\S+) \(([^)]+)\)/)
      if (milestoneMatch) {
        const currentStatus = milestoneMatch[2]
        updated = updated.replace(
          new RegExp(`### 📋 ${milestoneMatch[1]} \\(${currentStatus}\\)(?!.*Shipped)`),
          `### ✅ ${milestoneMatch[1]} (Shipped: ${dateStr})`
        )
      }

      // Dry-run: show what would be written without persisting
      if (args?.dryRun) {
        const nextPhase = phaseNum + 1
        const proposedState = `phase: ${nextPhase}\nstatus: in_progress`
        return {
          success: true,
          message: `[DRY-RUN] Would update ROADMAP.md:\n${updated}\n\n[DRY-RUN] Would update STATE.md:\n${proposedState}`,
          meta: { dryRun: true, phase: phaseNum }
        }
      }

      writeFileSync(roadmapPath, updated, "utf-8")

      // Cascade to STATE.md: advance current_phase to N+1, set status to in_progress
      const nextPhase = phaseNum + 1
      updatePlanningState(dir, {
        phase: nextPhase,
        status: "in_progress"
      })

      return {
        success: true,
        message: `Phase ${phaseNum} marked complete in ROADMAP.md and STATE.md updated (now Phase ${nextPhase})`,
        phase: phaseNum
      }
    }

    // Handle --add phase
    if (args?.add) {
      const newPhase = args.add
      const sanitized = newPhase.replace(/[^\w\s\-]/g, '')
      const newPhaseMd = `\n- [ ] Phase ${sanitized}: ${sanitized}\n`

      // Dry-run: show what would be written without persisting
      if (args?.dryRun) {
        return {
          success: true,
          message: `[DRY-RUN] Would add to ROADMAP.md:\n${newPhaseMd}`,
          meta: { dryRun: true, phase: sanitized }
        }
      }

      const insertPoint = content.lastIndexOf("### 📋")
      if (insertPoint === -1) {
        return { error: "Could not find insertion point for new phase", code: "INSERT_FAILED" }
      }

      const updated = content.slice(0, insertPoint) + newPhaseMd + content.slice(insertPoint)
      writeFileSync(roadmapPath, updated, "utf-8")

      return {
        success: true,
        message: `Phase "${newPhase}" added to ROADMAP.md`,
        phase: newPhase
      }
    }

    // Default: display formatted roadmap
    if (args?.json) {
      return {
        success: true,
        data: { roadmap: content },
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    // Validate filter if provided
    if (args?.filter && !["complete", "in-progress", "planned"].includes(args.filter)) {
      return { error: "Filter must be one of: complete, in-progress, planned", code: "INVALID_FILTER" }
    }

    // Parse and format roadmap for display
    const lines = content.split("\n")
    const state = readPlanningState(dir)
    const stepsComplete = Array.isArray(state.steps_complete) ? state.steps_complete : []
    const stepsPending = Array.isArray(state.steps_pending) ? state.steps_pending : []
    const currentPhase = state.phase ?? 0

    // Collect phase entries for filtering and sorting
    interface PhaseEntry {
      raw: string
      type: "complete" | "planned" | "shipped" | "other"
      phaseNum: number | null
      name: string
      section: string
      line: string
    }

    const phaseEntries: PhaseEntry[] = []
    let currentSection = ""

    for (const line of lines) {
      if (line.startsWith("### ")) {
        currentSection = line.replace("### ", "").replace("[x] ", "✅ ").replace("[ ] ", "○ ")
      } else if (line.startsWith("- [x] Phase")) {
        const phaseMatch = line.match(/Phase (\d+)/)
        const nameMatch = line.match(/Phase \d+: ([^—]+)/)
        phaseEntries.push({
          raw: line,
          type: "complete",
          phaseNum: phaseMatch ? parseInt(phaseMatch[1]) : null,
          name: nameMatch ? nameMatch[1].trim() : "",
          section: currentSection,
          line
        })
      } else if (line.startsWith("- [ ] Phase")) {
        const phaseMatch = line.match(/Phase (\d+)/)
        const nameMatch = line.match(/Phase \d+: ([^—]+)/)
        phaseEntries.push({
          raw: line,
          type: "planned",
          phaseNum: phaseMatch ? parseInt(phaseMatch[1]) : null,
          name: nameMatch ? nameMatch[1].trim() : "",
          section: currentSection,
          line
        })
      } else if (line.startsWith("- ✅")) {
        phaseEntries.push({
          raw: line,
          type: "shipped",
          phaseNum: null,
          name: "",
          section: currentSection,
          line
        })
      }
    }

    // Apply filter: resolve "in-progress" to current phase number
    const filterSet = new Set<number>()
    if (args?.filter === "complete") {
      phaseEntries.forEach(p => {
        if (p.type === "complete" && p.phaseNum !== null) filterSet.add(p.phaseNum)
      })
    } else if (args?.filter === "planned") {
      phaseEntries.forEach(p => {
        if (p.type === "planned" && p.phaseNum !== null) filterSet.add(p.phaseNum)
      })
    } else if (args?.filter === "in-progress") {
      if (currentPhase > 0) filterSet.add(currentPhase)
    }

    // Apply sort (when not "number")
    if (args?.sort && args.sort !== "number") {
      phaseEntries.sort((a, b) => {
        if (args.sort === "name") {
          const nameA = a.name.toLowerCase()
          const nameB = b.name.toLowerCase()
          return nameA.localeCompare(nameB)
        } else if (args.sort === "status") {
          const order = { complete: 0, "in-progress": 1, planned: 2 }
          // Map in-progress to the current phase being treated as "complete" for sort
          const statusA = (a.phaseNum === currentPhase) ? "in-progress" : a.type
          const statusB = (b.phaseNum === currentPhase) ? "in-progress" : b.type
          const ordA = statusA === "in-progress" ? 1 : order[statusA as keyof typeof order] ?? 2
          const ordB = statusB === "in-progress" ? 1 : order[statusB as keyof typeof order] ?? 2
          if (ordA !== ordB) return ordA - ordB
          return (a.phaseNum ?? 0) - (b.phaseNum ?? 0)
        }
        return 0
      })
    }

    // Helper to bold matching text
    function boldMatch(text: string, query: string): string {
      if (!query) return text
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
      return text.replace(regex, "**$1**")
    }

    // Build output
    let output = ["═".repeat(55), "ROADMAP", "═".repeat(55)]

    currentSection = ""
    for (const entry of phaseEntries) {
      // Skip non-current-section entries when filtering
      if (filterSet.size > 0 && entry.phaseNum !== null && !filterSet.has(entry.phaseNum)) {
        continue
      }

      // Section header
      if (entry.section !== currentSection) {
        currentSection = entry.section
        output.push("", currentSection)
      }

      if (entry.type === "shipped") {
        output.push(`  ${entry.raw}`)
      } else if (entry.type === "complete" || entry.type === "planned") {
        const phaseInfo = entry.raw.replace(/- \[[x ]\] Phase \d+: /, "").replace(" — ", " | ")
        let stepInfo = ""
        if (entry.phaseNum !== null) {
          if (entry.type === "complete") {
            const pComplete = stepsComplete.filter(s => s === entry.phaseNum).length
            const pPending = stepsPending.filter(s => s === entry.phaseNum).length
            if (pComplete > 0 || pPending > 0) {
              stepInfo = ` [${pComplete}/${pComplete + pPending} steps]`
            }
          } else {
            const pPending = stepsPending.filter(s => s === entry.phaseNum).length
            if (pPending > 0) {
              stepInfo = ` [${pPending} pending]`
            }
          }
        }
        const isCurrent = entry.phaseNum === currentPhase
        const marker = isCurrent ? ">> " : "   "
        const icon = entry.type === "complete" ? "✓" : "○"

        // Apply search highlighting to phase info
        let displayInfo = phaseInfo
        if (args?.search) {
          displayInfo = boldMatch(phaseInfo, args.search)
        }

        output.push(`${marker}${icon} ${displayInfo}${stepInfo}`)
      } else if (entry.raw.trim().startsWith("|")) {
        output.push(`  ${entry.raw.trim()}`)
      }
    }

    output.push("", "─".repeat(55))
    output.push("  Use: /roadmap --complete <N>  to mark phase N complete")
    output.push("  Use: /roadmap --add <name>     to add a new phase")
    output.push("  Use: /roadmap --dry-run       to preview changes without writing")
    output.push("  Use: /roadmap --filter <F>    to filter by status (complete|in-progress|planned)")
    output.push("  Use: /roadmap --search <Q>    to highlight matching phases")
    output.push("  Use: /roadmap --sort <F>      to sort by field (number|name|status)")
    output.push("═".repeat(55))

    return {
      success: true,
      message: output.join("\n"),
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}
