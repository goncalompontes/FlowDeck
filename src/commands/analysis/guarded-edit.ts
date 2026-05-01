/**
 * /fd-guarded-edit — edit gate command
 *
 * Runs before a risky edit to determine whether to:
 *   auto-approve    → safe to apply without confirmation
 *   require-confirmation → apply with inline warning and human ACK
 *   require-review  → route to a human reviewer before applying
 *   block           → do not apply; violation of arch constraint or critical policy
 *
 * Combines: policy engine, patch trust score, volatility, arch constraints,
 * failure history, and safe execution mode resolution.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { codebaseDir, planningDir, timestamp } from "../../tools/planning-state-lib"
import { scorePatch } from "../../hooks/patch-trust"
import { checkArchConstraint } from "../../hooks/tool-guard"
import { resolveExecutionMode } from "../../hooks/guard-rails"

export type GateDecision = "auto-approve" | "require-confirmation" | "require-review" | "block"

export interface GuardedEditResult {
  decision: GateDecision
  reason: string
  risk_score: number
  execution_mode: "auto" | "guarded" | "review-only"
  policy_violations: string[]
  volatile_files: string[]
  prior_failures: string[]
  arch_constraint: boolean
  recommended_action: string
}

function loadActivePolicies(directory: string): Array<{ id: string; trigger: string; rule: string }> {
  const p = join(codebaseDir(directory), "POLICIES.json")
  if (!existsSync(p)) return []
  try {
    const store = JSON.parse(readFileSync(p, "utf-8"))
    return (store.policies ?? []).filter((pol: any) => pol.active)
  } catch {
    return []
  }
}

function loadVolatileFiles(directory: string): Set<string> {
  const p = join(codebaseDir(directory), "VOLATILITY.json")
  if (!existsSync(p)) return new Set()
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"))
    return new Set(
      (data.entries ?? [])
        .filter((e: any) => e.stability === "volatile" || e.stability === "critical")
        .map((e: any) => e.path as string)
    )
  } catch {
    return new Set()
  }
}

function loadPriorFailurePaths(directory: string): Map<string, string[]> {
  // Returns map of filePath → [failureId, ...]
  const p = join(codebaseDir(directory), "FAILURES.json")
  if (!existsSync(p)) return new Map()
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"))
    const result = new Map<string, string[]>()
    for (const entry of data.entries ?? []) {
      if (entry.tags?.includes("resolved")) continue
      for (const path of entry.affected_paths ?? []) {
        const existing = result.get(path) ?? []
        result.set(path, [...existing, entry.id])
      }
    }
    return result
  } catch {
    return new Map()
  }
}

function decideGate(
  trustScore: number,
  execMode: "auto" | "guarded" | "review-only",
  policyViolations: string[],
  archConstrained: boolean,
  isVolatile: boolean,
  hasPriorFailures: boolean,
): { decision: GateDecision; reason: string } {
  // Hard blocks
  if (archConstrained) {
    return { decision: "block", reason: "Architectural constraint violation — path is forbidden by CONSTRAINTS.md" }
  }
  if (policyViolations.length > 0 && trustScore < 30) {
    return { decision: "block", reason: `Policy violation + low trust score (${trustScore}): ${policyViolations[0]}` }
  }
  if (execMode === "review-only") {
    return { decision: "require-review", reason: "Repository is in review-only execution mode" }
  }

  // High risk → require review
  if (trustScore < 40 || (policyViolations.length > 0)) {
    return { decision: "require-review", reason: `High risk: trust score ${trustScore}/100, ${policyViolations.length} policy violation(s)` }
  }

  // Moderate risk → require confirmation
  if (execMode === "guarded" || isVolatile || hasPriorFailures) {
    const signals = []
    if (execMode === "guarded") signals.push("guarded execution mode")
    if (isVolatile) signals.push("volatile file")
    if (hasPriorFailures) signals.push("prior failures on this path")
    return { decision: "require-confirmation", reason: `Moderate risk: ${signals.join(", ")}` }
  }

  // Low risk
  return { decision: "auto-approve", reason: `Trust score ${trustScore}/100, no policy violations, stable file` }
}

export const guardedEditCommand = {
  name: "fd-guarded-edit",
  description: "Edit gate — decides auto-approve / require-confirmation / require-review / block based on policy, trust score, volatility, and arch constraints",
  async execute(context: any, args?: { file?: string; change?: string; "dry-run"?: boolean; json?: boolean }) {
    const dir = context.directory ?? process.cwd()

    if (!args?.file && !args?.change) {
      return {
        error: "Provide --file and/or --change to evaluate. Example: /fd-guarded-edit --file src/auth.ts --change 'update JWT expiry'",
        code: "NO_INPUT",
        hint: "Both --file and --change are optional, but at least one is needed for useful analysis",
      }
    }

    const filePath = args?.file ?? ""
    const change = args?.change ?? ""
    const isDryRun = args?.["dry-run"] ?? false

    // ── Gather risk signals ──────────────────────────────────────────────
    const trustScore = filePath ? scorePatch(dir, filePath, change || undefined) : { score: 70, verdict: "safe" as const, signals: [] }
    const archConstraint = filePath ? checkArchConstraint(dir, filePath) !== null : false

    const configPath = join(planningDir(dir), "config.json")
    const execMode = resolveExecutionMode(configPath, trustScore.score)

    const policies = loadActivePolicies(dir)
    const policyViolations: string[] = policies
      .filter(p => {
        const combined = [filePath, change].join(" ").toLowerCase()
        return combined.includes(p.trigger.toLowerCase())
      })
      .map(p => p.rule)

    const volatileFiles = loadVolatileFiles(dir)
    const priorFailureMap = loadPriorFailurePaths(dir)

    const isVolatile = filePath
      ? Array.from(volatileFiles).some(vf => filePath.includes(vf) || vf.includes(filePath))
      : false
    const priorFailureIds = filePath
      ? Array.from(priorFailureMap.entries())
          .filter(([path]) => filePath.includes(path) || path.includes(filePath))
          .flatMap(([, ids]) => ids)
      : []

    const { decision, reason } = decideGate(
      trustScore.score,
      execMode,
      policyViolations,
      archConstraint,
      isVolatile,
      priorFailureIds.length > 0,
    )

    const recommendedAction: Record<GateDecision, string> = {
      "auto-approve": "Apply the change — no action needed",
      "require-confirmation": "Review the diff carefully, then confirm to proceed",
      "require-review": "Route to human reviewer before applying — do not auto-apply",
      "block": "Do NOT apply this change — resolve the violation first",
    }

    const result: GuardedEditResult = {
      decision,
      reason,
      risk_score: trustScore.score,
      execution_mode: execMode,
      policy_violations: policyViolations,
      volatile_files: isVolatile ? [filePath] : [],
      prior_failures: priorFailureIds,
      arch_constraint: archConstraint,
      recommended_action: recommendedAction[decision],
    }

    if (args?.json) {
      return { success: true, data: result, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const decisionIcon: Record<GateDecision, string> = {
      "auto-approve": "✓",
      "require-confirmation": "⚠",
      "require-review": "⚑",
      "block": "✗",
    }

    const lines = [
      "═".repeat(60),
      `fd-guarded-edit${isDryRun ? " (dry-run)" : ""}`,
      "─".repeat(60),
      `  File:   ${filePath || "(not specified)"}`,
      `  Change: ${change || "(not specified)"}`,
      "─".repeat(60),
      `  ${decisionIcon[decision]} Decision:    ${decision.toUpperCase()}`,
      `  Reason:      ${reason}`,
      `  Risk score:  ${trustScore.score}/100 (${trustScore.verdict})`,
      `  Exec mode:   ${execMode}`,
    ]

    if (policyViolations.length > 0) {
      lines.push(`  Policies:    ${policyViolations.join("; ").substring(0, 60)}`)
    }
    if (priorFailureIds.length > 0) {
      lines.push(`  Prior fails: ${priorFailureIds.join(", ")}`)
    }

    lines.push("─".repeat(60))
    lines.push(`  → ${recommendedAction[decision]}`)
    lines.push("═".repeat(60))

    return {
      success: true,
      message: lines.join("\n"),
      ...result,
      meta: { formatted: "table", timestamp: timestamp() },
    }
  },
}
