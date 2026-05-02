import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "./codebase-state"

const VOLATILITY_FILE = "VOLATILITY.json"

export interface VolatilityEntry {
  path: string
  churn_score: number        // 0–100: commits in last 90 days
  hotfix_count: number       // number of hotfix commits touching this file
  todo_count: number         // unresolved TODO/FIXME/HACK comments
  last_breakage?: string     // ISO timestamp of last breakage
  stability: "stable" | "moderate" | "volatile" | "critical"
  notes: string[]
}

export interface VolatilityStore {
  version: string
  last_updated: string
  generated_at: string
  entries: VolatilityEntry[]
}

function volatilityPath(directory: string): string {
  return join(codebaseDir(directory), VOLATILITY_FILE)
}

function readStore(directory: string): VolatilityStore {
  const p = volatilityPath(directory)
  if (!existsSync(p)) return { version: "1.0", last_updated: new Date().toISOString(), generated_at: new Date().toISOString(), entries: [] }
  try {
    return JSON.parse(readFileSync(p, "utf-8"))
  } catch {
    return { version: "1.0", last_updated: new Date().toISOString(), generated_at: new Date().toISOString(), entries: [] }
  }
}

function writeStore(directory: string, store: VolatilityStore): void {
  const base = codebaseDir(directory)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  store.last_updated = new Date().toISOString()
  writeFileSync(volatilityPath(directory), JSON.stringify(store, null, 2), "utf-8")
}

function stabilityLabel(churn: number, hotfixes: number, todos: number): VolatilityEntry["stability"] {
  const score = churn + hotfixes * 10 + todos * 2
  if (score >= 80) return "critical"
  if (score >= 50) return "volatile"
  if (score >= 20) return "moderate"
  return "stable"
}

export const volatilityMapTool: ToolDefinition = tool({
  description: "Codebase Volatility Map: read/write/query .codebase/VOLATILITY.json — highlights unstable zones based on churn, hotfix frequency, and TODO clusters",
  args: {
    action: tool.schema.enum(["read", "write", "query_hotspots", "update_entry"]),
    entries: tool.schema.array(tool.schema.object({
      path: tool.schema.string(),
      churn_score: tool.schema.number(),
      hotfix_count: tool.schema.number(),
      todo_count: tool.schema.number(),
      last_breakage: tool.schema.string().optional(),
      notes: tool.schema.array(tool.schema.string()),
    })).optional(),
    entry: tool.schema.object({
      path: tool.schema.string(),
      churn_score: tool.schema.number(),
      hotfix_count: tool.schema.number(),
      todo_count: tool.schema.number(),
      last_breakage: tool.schema.string().optional(),
      notes: tool.schema.array(tool.schema.string()),
    }).optional(),
    threshold: tool.schema.enum(["stable", "moderate", "volatile", "critical"]).optional(),
    path_prefix: tool.schema.string().optional(),
    limit: tool.schema.number().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const store = readStore(dir)

    switch (args.action) {
      case "read": {
        return JSON.stringify({ last_updated: store.last_updated, count: store.entries.length, entries: store.entries })
      }

      case "write": {
        if (!args.entries) return JSON.stringify({ error: "entries required" })
        store.entries = args.entries.map(e => ({
          ...e,
          stability: stabilityLabel(e.churn_score, e.hotfix_count, e.todo_count),
        }))
        store.generated_at = new Date().toISOString()
        writeStore(dir, store)
        return JSON.stringify({ success: true, count: store.entries.length })
      }

      case "update_entry": {
        if (!args.entry) return JSON.stringify({ error: "entry required" })
        const idx = store.entries.findIndex(e => e.path === args.entry!.path)
        const updated: VolatilityEntry = {
          ...args.entry,
          stability: stabilityLabel(args.entry.churn_score, args.entry.hotfix_count, args.entry.todo_count),
        }
        if (idx >= 0) {
          store.entries[idx] = updated
        } else {
          store.entries.push(updated)
        }
        writeStore(dir, store)
        return JSON.stringify({ success: true, path: args.entry.path, stability: updated.stability })
      }

      case "query_hotspots": {
        const levels: Record<string, number> = { stable: 0, moderate: 1, volatile: 2, critical: 3 }
        const minLevel = levels[args.threshold ?? "volatile"] ?? 2
        let results = store.entries.filter(e => (levels[e.stability] ?? 0) >= minLevel)
        if (args.path_prefix) results = results.filter(e => e.path.startsWith(args.path_prefix!))
        // Sort by stability desc then churn desc
        results.sort((a, b) => (levels[b.stability] - levels[a.stability]) || (b.churn_score - a.churn_score))
        if (args.limit) results = results.slice(0, args.limit)
        return JSON.stringify({ count: results.length, hotspots: results })
      }
    }
  },
})
