/**
 * /fd-evaluate-risk — standalone risk assessment command
 *
 * Estimates change risk, confidence, likely regressions, whether
 * approval is needed, and suggests safer alternatives when risk is high.
 *
 * Works without a --file if --change is provided (keyword-based analysis).
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { runImpactRadar } from "../../lib/impact-radar"
import { scorePatch } from "../../hooks/patch-trust"

const REGRESSION_CATEGORIES = [
  "performance", "auth", "schema", "ui-state", "async-flow",
  "api-contract", "data-integrity", "security", "config", "i18n",
]

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  performance: ["slow", "latency", "cache", "query", "index", "bulk", "batch", "load"],
  auth: ["auth", "token", "session", "jwt", "oauth", "permission", "rbac", "login"],
  schema: ["schema", "migration", "column", "table", "foreign key", "constraint", "index"],
  "ui-state": ["state", "redux", "context", "store", "hook", "render", "component"],
  "async-flow": ["async", "await", "promise", "callback", "event", "queue", "worker"],
  "api-contract": ["api", "endpoint", "route", "request", "response", "payload", "version"],
  "data-integrity": ["transaction", "rollback", "constraint", "unique", "required", "nullable"],
  security: ["secret", "password", "encrypt", "decrypt", "hash", "sanitize", "inject"],
  config: ["env", "config", "setting", "flag", "feature flag", "toggle", "env var"],
  i18n: ["locale", "translation", "i18n", "l10n", "format", "timezone", "language"],
}

function predictRegressions(changeText: string): string[] {
  const lower = changeText.toLowerCase()
  return REGRESSION_CATEGORIES.filter(cat =>
    (CATEGORY_KEYWORDS[cat] ?? []).some(kw => lower.includes(kw))
  )
}

type RiskLevel = "low" | "medium" | "high" | "critical"

function toRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "low"
  if (score >= 50) return "medium"
  if (score >= 25) return "high"
  return "critical"
}

function computeConfidence(directory: string): number {
  // Confidence = how much context data the system has about this codebase
  // More data → higher confidence → more reliable risk assessment
  const cd = codebaseDir(directory)
  let score = 20  // base
  if (existsSync(join(cd, "ARCHITECTURE.md"))) score += 20
  if (existsSync(join(cd, "STACK.md"))) score += 10
  if (existsSync(join(cd, "MEMORY.json"))) {
    try {
      const nodes = Object.keys(JSON.parse(readFileSync(join(cd, "MEMORY.json"), "utf-8")).nodes ?? {}).length
      score += Math.min(25, nodes * 2)
    } catch { /* skip */ }
  }
  if (existsSync(join(cd, "VOLATILITY.json"))) {
    try {
      const entries = JSON.parse(readFileSync(join(cd, "VOLATILITY.json"), "utf-8")).entries?.length ?? 0
      score += Math.min(15, entries)
    } catch { /* skip */ }
  }
  if (existsSync(join(cd, "FAILURES.json"))) {
    try {
      const entries = JSON.parse(readFileSync(join(cd, "FAILURES.json"), "utf-8")).entries?.length ?? 0
      score += Math.min(10, entries)
    } catch { /* skip */ }
  }
  return Math.min(100, score)
}

function saferAlternative(riskLevel: RiskLevel, change: string): string | null {
  if (riskLevel === "low" || riskLevel === "medium") return null
  const lower = change.toLowerCase()
  if (lower.includes("auth") || lower.includes("jwt")) {
    return "Consider a feature-flag rollout or shadow mode before swapping auth tokens"
  }
  if (lower.includes("schema") || lower.includes("migration")) {
    return "Consider a backward-compatible migration (add column, backfill, then drop old) to avoid data loss"
  }
  if (lower.includes("api") || lower.includes("endpoint")) {
    return "Consider versioning the endpoint (/v2) and deprecating the old one with a sunset header"
  }
  if (lower.includes("payment") || lower.includes("billing")) {
    return "Consider a canary deployment limited to internal users before full rollout"
  }
  return "Consider breaking the change into smaller, independently testable steps"
}

export const evaluateRiskCommand = {
  name: "fd-evaluate-risk",
  description: "Risk assessment — estimates change risk, confidence, likely regressions, and whether approval is needed before proceeding",
  async execute(context: any, args?: { change?: string; file?: string; volatility?: boolean; confidence?: boolean; "risk-score"?: boolean; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /fd-new-project first.", code: "NOT_INITIALIZED" }
    }

    if (!args?.change && !args?.file) {
      return {
        error: "Provide --change and/or --file. Example: /fd-evaluate-risk --change 'refactor auth middleware'",
        code: "NO_INPUT",
      }
    }

    const change = args?.change ?? ""
    const filePath = args?.file ?? ""
    const state = readPlanningState(dir)

    // ── Risk score from patch trust (file-based) or fallback ─────────────
    let riskScore: number
    let trustSignals: string[] = []
    if (filePath) {
      const ts = scorePatch(dir, filePath, change || undefined)
      riskScore = ts.score
      trustSignals = ts.signals
    } else {
      // Keyword-based scoring when no file is provided
      const radar = runImpactRadar(dir, change)
      const baseDeduction = radar.hotspots.length * 12 + radar.known_failures.length * 10
      riskScore = Math.max(0, 100 - baseDeduction)
      if (radar.hotspots.length > 0) trustSignals.push(`${radar.hotspots.length} volatile zone(s)`)
      if (radar.known_failures.length > 0) trustSignals.push(`${radar.known_failures.length} known failure(s)`)
    }

    const riskLevel = toRiskLevel(riskScore)
    const confidence = computeConfidence(dir)
    const likelyRegressions = change ? predictRegressions(change) : []

    // ── Approval threshold ───────────────────────────────────────────────
    const approvalNeeded = riskScore < 60 || likelyRegressions.length >= 3

    // ── Volatile zones ───────────────────────────────────────────────────
    let volatileZoneCount = 0
    let volatileZones: string[] = []
    if (args?.volatility !== false) {
      const volPath = join(codebaseDir(dir), "VOLATILITY.json")
      if (existsSync(volPath)) {
        try {
          const v = JSON.parse(readFileSync(volPath, "utf-8"))
          const zones = (v.entries ?? []).filter((e: any) =>
            e.stability === "volatile" || e.stability === "critical"
          )
          volatileZoneCount = zones.length
          if (change) {
            const words = change.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
            volatileZones = zones
              .filter((e: any) => words.some((w: string) => e.path.toLowerCase().includes(w)))
              .map((e: any) => e.path)
              .slice(0, 5)
          }
        } catch { /* skip */ }
      }
    }

    const saferAlt = saferAlternative(riskLevel, change)
    const agents = [
      { name: "researcher", role: "map change description to affected paths and modules" },
      { name: "reviewer", role: "validate risk level and regression predictions" },
      riskLevel === "high" || riskLevel === "critical"
        ? { name: "security-auditor", role: "perform targeted security review of high-risk areas" }
        : null,
    ].filter(Boolean)

    const result = {
      risk_score: riskScore,
      risk_level: riskLevel,
      confidence,
      approval_needed: approvalNeeded,
      likely_regressions: likelyRegressions,
      volatile_zones: volatileZoneCount,
      volatile_matches: volatileZones,
      safer_alternative: saferAlt,
      trust_signals: trustSignals,
    }

    if (args?.json) {
      return {
        success: true,
        data: { ...result, agents, phase: state.phase },
        meta: { formatted: "json", timestamp: timestamp() },
      }
    }

    const riskIcon: Record<RiskLevel, string> = { low: "✓", medium: "⚡", high: "⚠", critical: "✗" }

    const lines = [
      "═".repeat(60),
      "fd-evaluate-risk",
      "─".repeat(60),
      `  Change:      ${change || "(not specified)"}`,
      `  File:        ${filePath || "(not specified)"}`,
      "─".repeat(60),
      `  ${riskIcon[riskLevel]} Risk level:  ${riskLevel.toUpperCase()} (score: ${riskScore}/100)`,
      `  Confidence:  ${confidence}/100 (codebase context coverage)`,
      `  Approval:    ${approvalNeeded ? "REQUIRED" : "not required"}`,
    ]

    if (likelyRegressions.length > 0) {
      lines.push(`  Regressions: ${likelyRegressions.join(", ")}`)
    }
    if (volatileZones.length > 0) {
      lines.push(`  Hot zones:   ${volatileZones.join(", ")}`)
    }
    if (trustSignals.length > 0) {
      lines.push(`  Signals:     ${trustSignals.join(", ")}`)
    }
    if (saferAlt) {
      lines.push("─".repeat(60))
      lines.push(`  Safer alt:   ${saferAlt}`)
    }

    lines.push("─".repeat(60))
    lines.push(`  researcher → map to affected paths`)
    lines.push(`  reviewer   → validate risk + regressions`)
    if (riskLevel === "high" || riskLevel === "critical") {
      lines.push(`  security   → targeted review of high-risk areas`)
    }
    lines.push("═".repeat(60))

    return {
      success: true,
      message: lines.join("\n"),
      ...result,
      agents,
      phase: state.phase,
      meta: { formatted: "table", timestamp: timestamp() },
    }
  },
}
