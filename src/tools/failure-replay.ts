import { tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "./codebase-state"

const FAILURES_FILE = "FAILURES.json"

export interface FailureEntry {
  id: string
  timestamp: string
  type: "reverted_commit" | "failed_deployment" | "flaky_test" | "bug_fix" | "build_failure"
  description: string
  affected_paths: string[]
  root_cause?: string
  fix_applied?: string
  tags: string[]
  recurrence_count: number
}

export interface FailureStore {
  version: string
  last_updated: string
  entries: FailureEntry[]
}

function failuresPath(directory: string): string {
  return join(codebaseDir(directory), FAILURES_FILE)
}

function readStore(directory: string): FailureStore {
  const p = failuresPath(directory)
  if (!existsSync(p)) return { version: "1.0", last_updated: new Date().toISOString(), entries: [] }
  try {
    return JSON.parse(readFileSync(p, "utf-8"))
  } catch {
    return { version: "1.0", last_updated: new Date().toISOString(), entries: [] }
  }
}

function writeStore(directory: string, store: FailureStore): void {
  const base = codebaseDir(directory)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  store.last_updated = new Date().toISOString()
  writeFileSync(failuresPath(directory), JSON.stringify(store, null, 2), "utf-8")
}

export const failureReplayTool = tool({
  description: "Failure Replay Engine: record and query past failures (reverted commits, failed deployments, flaky tests, bug fixes) in .codebase/FAILURES.json so the agent avoids repeating mistakes",
  args: {
    action: tool.schema.enum(["record", "query", "list", "mark_resolved"]),
    entry: tool.schema.object({
      id: tool.schema.string(),
      type: tool.schema.enum(["reverted_commit", "failed_deployment", "flaky_test", "bug_fix", "build_failure"]),
      description: tool.schema.string(),
      affected_paths: tool.schema.array(tool.schema.string()),
      root_cause: tool.schema.string().optional(),
      fix_applied: tool.schema.string().optional(),
      tags: tool.schema.array(tool.schema.string()),
    }).optional(),
    query: tool.schema.object({
      type: tool.schema.enum(["reverted_commit", "failed_deployment", "flaky_test", "bug_fix", "build_failure"]).optional(),
      path_prefix: tool.schema.string().optional(),
      tag: tool.schema.string().optional(),
      limit: tool.schema.number().optional(),
    }).optional(),
    entry_id: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const store = readStore(dir)

    switch (args.action) {
      case "record": {
        if (!args.entry) return JSON.stringify({ error: "entry required" })
        const existing = store.entries.find(e => e.id === args.entry!.id)
        if (existing) {
          existing.recurrence_count++
          existing.timestamp = new Date().toISOString()
          if (args.entry.root_cause) existing.root_cause = args.entry.root_cause
          if (args.entry.fix_applied) existing.fix_applied = args.entry.fix_applied
        } else {
          store.entries.push({
            ...args.entry,
            timestamp: new Date().toISOString(),
            recurrence_count: 1,
          })
        }
        writeStore(dir, store)
        return JSON.stringify({ success: true, id: args.entry.id, recurrence_count: existing?.recurrence_count ?? 1 })
      }

      case "query": {
        const q = args.query ?? {}
        let results = store.entries.filter(e => {
          if (q.type && e.type !== q.type) return false
          if (q.path_prefix && !e.affected_paths.some(p => p.startsWith(q.path_prefix!))) return false
          if (q.tag && !e.tags.includes(q.tag)) return false
          return true
        })
        // Sort by recurrence descending
        results.sort((a, b) => b.recurrence_count - a.recurrence_count)
        if (q.limit) results = results.slice(0, q.limit)
        return JSON.stringify({ count: results.length, entries: results })
      }

      case "list": {
        const sorted = [...store.entries].sort((a, b) => b.recurrence_count - a.recurrence_count)
        return JSON.stringify({ count: sorted.length, entries: sorted.map(e => ({ id: e.id, type: e.type, recurrence_count: e.recurrence_count, description: e.description.substring(0, 80) })) })
      }

      case "mark_resolved": {
        if (!args.entry_id) return JSON.stringify({ error: "entry_id required" })
        const entry = store.entries.find(e => e.id === args.entry_id)
        if (!entry) return JSON.stringify({ error: `Entry not found: ${args.entry_id}` })
        entry.tags = [...new Set([...entry.tags, "resolved"])]
        writeStore(dir, store)
        return JSON.stringify({ success: true, id: args.entry_id })
      }
    }
  },
})
