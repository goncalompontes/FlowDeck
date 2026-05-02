import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { codebaseDir } from "./codebase-state"

const POLICIES_FILE = "POLICIES.json"

export interface Policy {
  id: string
  name: string
  trigger: string            // what pattern triggers this policy
  rule: string               // what the agent should do/avoid
  source: "manual" | "learned"
  failure_count: number      // how many times the policy was violated before being added
  created_at: string
  last_violated?: string
  active: boolean
}

export interface PolicyStore {
  version: string
  last_updated: string
  policies: Policy[]
}

function policiesPath(directory: string): string {
  return join(codebaseDir(directory), POLICIES_FILE)
}

function readStore(directory: string): PolicyStore {
  const p = policiesPath(directory)
  if (!existsSync(p)) return { version: "1.0", last_updated: new Date().toISOString(), policies: [] }
  try {
    return JSON.parse(readFileSync(p, "utf-8"))
  } catch {
    return { version: "1.0", last_updated: new Date().toISOString(), policies: [] }
  }
}

function writeStore(directory: string, store: PolicyStore): void {
  const base = codebaseDir(directory)
  if (!existsSync(base)) mkdirSync(base, { recursive: true })
  store.last_updated = new Date().toISOString()
  writeFileSync(policiesPath(directory), JSON.stringify(store, null, 2), "utf-8")
}

export const policyEngineTool: ToolDefinition = tool({
  description: "Self-Healing Policy Engine: manage .codebase/POLICIES.json — add, list, query, toggle, and record violations of editing policies learned from past failures",
  args: {
    action: tool.schema.enum(["list", "add", "record_violation", "toggle", "query"]),
    policy: tool.schema.object({
      id: tool.schema.string(),
      name: tool.schema.string(),
      trigger: tool.schema.string(),
      rule: tool.schema.string(),
      source: tool.schema.enum(["manual", "learned"]),
      failure_count: tool.schema.number(),
    }).optional(),
    policy_id: tool.schema.string().optional(),
    active: tool.schema.boolean().optional(),
    query: tool.schema.object({
      source: tool.schema.enum(["manual", "learned"]).optional(),
      active_only: tool.schema.boolean().optional(),
      trigger_contains: tool.schema.string().optional(),
    }).optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const store = readStore(dir)

    switch (args.action) {
      case "list": {
        const active = store.policies.filter(p => p.active)
        return JSON.stringify({ total: store.policies.length, active: active.length, policies: store.policies })
      }

      case "add": {
        if (!args.policy) return JSON.stringify({ error: "policy required" })
        const existing = store.policies.find(p => p.id === args.policy!.id)
        if (existing) {
          Object.assign(existing, args.policy, { last_updated: new Date().toISOString() })
        } else {
          store.policies.push({ ...args.policy, created_at: new Date().toISOString(), active: true })
        }
        writeStore(dir, store)
        return JSON.stringify({ success: true, id: args.policy.id })
      }

      case "record_violation": {
        if (!args.policy_id) return JSON.stringify({ error: "policy_id required" })
        const policy = store.policies.find(p => p.id === args.policy_id)
        if (!policy) return JSON.stringify({ error: `Policy not found: ${args.policy_id}` })
        policy.failure_count++
        policy.last_violated = new Date().toISOString()
        writeStore(dir, store)
        return JSON.stringify({ success: true, policy_id: args.policy_id, failure_count: policy.failure_count })
      }

      case "toggle": {
        if (!args.policy_id) return JSON.stringify({ error: "policy_id required" })
        const policy = store.policies.find(p => p.id === args.policy_id)
        if (!policy) return JSON.stringify({ error: `Policy not found: ${args.policy_id}` })
        policy.active = args.active !== undefined ? args.active : !policy.active
        writeStore(dir, store)
        return JSON.stringify({ success: true, policy_id: args.policy_id, active: policy.active })
      }

      case "query": {
        const q = args.query ?? {}
        let results = store.policies.filter(p => {
          if (q.source && p.source !== q.source) return false
          if (q.active_only && !p.active) return false
          if (q.trigger_contains && !p.trigger.toLowerCase().includes(q.trigger_contains.toLowerCase())) return false
          return true
        })
        return JSON.stringify({ count: results.length, policies: results })
      }
    }
  },
})
