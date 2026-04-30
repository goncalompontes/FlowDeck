import { join } from "path"
import { tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { statePath, phasePlanPath, resultPath, planningDir, parseState, timestamp, appendHistory } from "./planning-state-lib"

const PLAN_FILE = "PLAN.md"

export const planningStateTool = tool({
  description: "Manage planning state: read STATE.md, update STATE.md, read PLAN.md, mark steps complete",
  args: {
    action: tool.schema.enum(["read", "update", "read_plan", "mark_complete"]),
    updates: tool.schema.object({
      phase: tool.schema.number().optional(),
      status: tool.schema.enum(["planned", "in_progress", "complete", "blocked"]).optional(),
      last_action: tool.schema.string().optional(),
      next_action: tool.schema.string().optional(),
      blockers: tool.schema.array(tool.schema.string()).optional(),
      plan_file: tool.schema.string().optional(),
      plan_confirmed: tool.schema.boolean().optional(),
      confirmed_at: tool.schema.string().optional(),
      steps_complete: tool.schema.array(tool.schema.number()).optional(),
      steps_pending: tool.schema.array(tool.schema.number()).optional(),
    }).optional(),
    step: tool.schema.number().optional(),
    summary: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return JSON.stringify({ error: "STATE.md not found. Initialize project first." })
    }

    switch (args.action) {
      case "read": {
        const content = readFileSync(sp, "utf-8")
        return JSON.stringify({ exists: true, ...parseState(content) })
      }

      case "update": {
        const u = args.updates
        if (!u) return JSON.stringify({ error: "No updates provided" })
        let content = readFileSync(sp, "utf-8")

        if (u.phase !== undefined) content = content.replace(/^phase:\s*.*/m, `phase: ${u.phase}`)
        if (u.status !== undefined) content = content.replace(/^status:\s*.*/m, `status: ${u.status}`)
        if (u.last_action !== undefined) {
          content = content.replace(/^last_action:\s*.*/m, `last_action: "${u.last_action}"`)
          content = appendHistory(content, u.last_action)
        }
        if (u.next_action !== undefined) content = content.replace(/^next_action:\s*.*/m, `next_action: "${u.next_action}"`)
        if (u.blockers !== undefined) {
          const blockersMd = u.blockers.map(b => `- ${b}`).join("\n")
          content = content.replace(/^## Blockers\n- none\n/, `## Blockers\n${blockersMd}\n`)
        }
        if (u.plan_file !== undefined) content = content.replace(/^plan_file:\s*.*/m, `plan_file: ${u.plan_file}`)
        if (u.plan_confirmed !== undefined) content = content.replace(/^plan_confirmed:\s*.*/m, `plan_confirmed: ${u.plan_confirmed}`)
        if (u.confirmed_at !== undefined) content = content.replace(/^confirmed_at:\s*.*/m, `confirmed_at: ${u.confirmed_at}`)
        if (u.steps_complete !== undefined) content = content.replace(/^steps_complete:\s*.*/m, `steps_complete: [${u.steps_complete.join(", ")}]`)
        if (u.steps_pending !== undefined) content = content.replace(/^steps_pending:\s*.*/m, `steps_pending: [${u.steps_pending.join(", ")}]`)

        writeFileSync(sp, content, "utf-8")
        return JSON.stringify({ success: true, updated_at: timestamp() })
      }

      case "read_plan": {
        const stateContent = readFileSync(sp, "utf-8")
        const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
        if (!phaseMatch) return JSON.stringify({ error: "No phase found in STATE.md" })

        const phase = parseInt(phaseMatch[1], 10)
        const planFileMatch = stateContent.match(/^plan_file:\s*(.+)/m)
        const planFile = planFileMatch ? planFileMatch[1].trim() : join(planningDir(dir), "phases", `phase-${phase}`, PLAN_FILE)

        if (!existsSync(planFile)) return JSON.stringify({ error: `Plan file not found: ${planFile}` })
        return JSON.stringify({ phase, plan_file: planFile, content: readFileSync(planFile, "utf-8") })
      }

      case "mark_complete": {
        const step = args.step
        const summary = args.summary
        if (step === undefined || !summary) return JSON.stringify({ error: "step and summary required" })

        const stateContent = readFileSync(sp, "utf-8")
        const phaseMatch = stateContent.match(/^phase:\s*(\d+)/m)
        if (!phaseMatch) return JSON.stringify({ error: "No phase in STATE.md" })

        const phase = parseInt(phaseMatch[1], 10)
        const planFile = phasePlanPath(dir, phase)
        const resultFile = resultPath(dir, phase)

        if (existsSync(planFile)) {
          let planContent = readFileSync(planFile, "utf-8")
          planContent = planContent.replace(new RegExp(`(\\[ \\])\\s*Step\\s+${step}\\b`, "i"), `[x] Step ${step}`)
          writeFileSync(planFile, planContent, "utf-8")
        }

        const entry = `- Step ${step} complete (${timestamp()}): ${summary}\n`
        if (existsSync(resultFile)) {
          writeFileSync(resultFile, readFileSync(resultFile, "utf-8") + entry, "utf-8")
        } else {
          writeFileSync(resultFile, `# Phase ${phase} Results\n\n${entry}`, "utf-8")
        }

        let newState = stateContent
        newState = newState.replace(/^last_action:\s*.*/m, `last_action: "Step ${step} complete: ${summary}"`)
        newState = newState.replace(/^last_action_at:\s*.*/m, `last_action_at: ${timestamp()}`)

        const completeMatch = newState.match(/^steps_complete:\s*\[(.*)\]/m)
        if (completeMatch) {
          const steps = (completeMatch[1].trim() ? completeMatch[1].split(",").map(s => s.trim()) : [])
          if (!steps.includes(String(step))) { steps.push(String(step)); newState = newState.replace(/^steps_complete:\s*\[.*\]/m, `steps_complete: [${steps.join(", ")}]`) }
        }

        const pendingMatch = newState.match(/^steps_pending:\s*\[(.*)\]/m)
        if (pendingMatch && pendingMatch[1].trim()) {
          const pending = pendingMatch[1].split(",").map(s => s.trim()).filter(s => s !== String(step))
          newState = newState.replace(/^steps_pending:\s*\[.*\]/m, `steps_pending: [${pending.join(", ")}]`)
        }

        writeFileSync(sp, appendHistory(newState, `Step ${step} complete: ${summary}`), "utf-8")
        return JSON.stringify({ success: true, step, completed_at: timestamp() })
      }
    }
  },
})