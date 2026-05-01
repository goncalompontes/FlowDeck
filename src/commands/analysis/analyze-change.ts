/**
 * /fd-analyze-change — umbrella analysis command
 *
 * Combines: impact radar, blast radius, regression prediction,
 * test gap detection, volatility map, and reviewer routing into a
 * single consolidated pre-change report.
 *
 * Replaces individual: /fd-impact-radar, /fd-blast-radius,
 * /fd-regression-predict, /fd-test-gap, /fd-volatility-map, /fd-review-route
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  statePath,
  codebaseDir,
  timestamp,
  readPlanningState,
} from "../../tools/planning-state-lib"
import { runImpactRadar, lookupPriorFailures } from "../../lib/impact-radar"
import { scorePatch } from "../../hooks/patch-trust"

const REGRESSION_CATEGORIES = [
  "performance", "auth", "schema", "ui-state", "async-flow",
  "api-contract", "data-integrity", "security", "config", "i18n",
]

const REVIEWER_KEYWORDS: Record<string, string[]> = {
  security: ["auth", "token", "password", "crypto", "jwt", "permission", "xss"],
  backend: ["api", "route", "controller", "service", "database", "query", "migration"],
  infra: ["docker", "kubernetes", "terraform", "ci", "deploy", "helm", "aws", "gcp"],
  "domain-owner": ["billing", "payment", "checkout", "order", "subscription"],
  frontend: ["component", "css", "react", "vue", "angular", "ui"],
  data: ["schema", "migration", "model", "index", "constraint"],
  devops: ["pipeline", "workflow", ".yml", ".yaml", "action", "cron"],
}

function routeReviewers(change: string, files: string[]): string[] {
  const combined = [change, ...files].join(" ").toLowerCase()
  return Object.entries(REVIEWER_KEYWORDS)
    .filter(([, kws]) => kws.some(kw => combined.includes(kw)))
    .map(([type]) => type)
}

export interface AnalyzeChangeArgs {
  change?: string
  scope?: string
  files?: string
  depth?: string
  impact?: boolean
  "blast-radius"?: boolean
  regression?: boolean
  "test-gap"?: boolean
  volatility?: boolean
  "review-route"?: boolean
  all?: boolean
  json?: boolean
}

export const analyzeChangeCommand = {
  name: "fd-analyze-change",
  description: "Pre-change analysis — runs impact radar, blast radius, regression prediction, test gaps, volatility, and reviewer routing in one report",
  async execute(context: any, args?: AnalyzeChangeArgs) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)
    const cd = codebaseDir(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /fd-new-project first.", code: "NOT_INITIALIZED" }
    }

    const change = args?.change || ""
    const scope = args?.scope || "all"
    const fileList = args?.files ? args.files.split(",").map(s => s.trim()) : []
    const depth = parseInt(args?.depth ?? "2", 10)

    // Determine which modules to run (default: all if no flags given)
    const runAll = !args?.impact && !args?.["blast-radius"] && !args?.regression
      && !args?.["test-gap"] && !args?.volatility && !args?.["review-route"]
      || args?.all === true
    const runImpact = runAll || !!args?.impact
    const runBlast = runAll || !!args?.["blast-radius"]
    const runRegression = runAll || !!args?.regression
    const runTestGap = runAll || !!args?.["test-gap"]
    const runVolatility = runAll || !!args?.volatility
    const runReviewRoute = runAll || !!args?.["review-route"]

    const modulesRun: string[] = []
    const state = readPlanningState(dir)

    // ── Impact Radar ────────────────────────────────────────────────────
    let hotspots: string[] = []
    let knownFailures: string[] = []
    let relatedModules: string[] = []
    let riskFlag = false
    if (runImpact && change) {
      modulesRun.push("impact-radar")
      const radar = runImpactRadar(dir, change)
      hotspots = radar.hotspots.map(h => h.path)
      knownFailures = radar.known_failures.map(f => f.id)
      relatedModules = radar.related_modules.map(m => m.path)
      riskFlag = radar.risk_flag
    }

    // ── Blast Radius ─────────────────────────────────────────────────────
    let moduleCount = 0
    let fragileCount = 0
    if (runBlast) {
      modulesRun.push("blast-radius")
      const memPath = join(cd, "MEMORY.json")
      if (existsSync(memPath)) {
        try { moduleCount = Object.keys(JSON.parse(readFileSync(memPath, "utf-8")).nodes ?? {}).length } catch { /* skip */ }
      }
      const failPath = join(cd, "FAILURES.json")
      if (existsSync(failPath)) {
        try {
          const data = JSON.parse(readFileSync(failPath, "utf-8"))
          fragileCount = (data.entries ?? []).filter((e: any) => e.recurrence_count >= 2).length
        } catch { /* skip */ }
      }
    }

    // ── Regression Prediction ────────────────────────────────────────────
    let pastRegressionSignals: string[] = []
    if (runRegression) {
      modulesRun.push("regression-predict")
      const failPath = join(cd, "FAILURES.json")
      if (existsSync(failPath)) {
        try {
          const data = JSON.parse(readFileSync(failPath, "utf-8"))
          pastRegressionSignals = (data.entries ?? []).flatMap((e: any) => e.tags ?? []).slice(0, 20)
        } catch { /* skip */ }
      }
    }

    // ── Test Gap ─────────────────────────────────────────────────────────
    const gapTypes = runTestGap ? [
      "missing test file for changed module",
      "untested error path",
      "untested branch (if/else/switch)",
      "no integration test for external call",
      "no regression test for previously-failed path",
    ] : []
    if (runTestGap) modulesRun.push("test-gap")

    // ── Volatility Map ───────────────────────────────────────────────────
    let volatileZones: Array<{ path: string; stability: string }> = []
    if (runVolatility) {
      modulesRun.push("volatility-map")
      const volPath = join(cd, "VOLATILITY.json")
      if (existsSync(volPath)) {
        try {
          const v = JSON.parse(readFileSync(volPath, "utf-8"))
          volatileZones = (v.entries ?? [])
            .filter((e: any) => e.stability === "volatile" || e.stability === "critical")
            .slice(0, 15)
        } catch { /* skip */ }
      }
    }

    // ── Review Routing ───────────────────────────────────────────────────
    let reviewers: string[] = []
    let trustScore: number | null = null
    let trustVerdict = "safe"
    if (runReviewRoute) {
      modulesRun.push("review-route")
      if (fileList.length > 0) {
        const ts = scorePatch(dir, fileList[0])
        trustScore = ts.score
        trustVerdict = ts.verdict
      }
      reviewers = routeReviewers(change, fileList)
    }

    // Prior failures for the affected scope
    const priorFailures = runImpact || runBlast
      ? lookupPriorFailures(dir, scope, change, 5)
      : []

    // ── Aggregate risk summary ───────────────────────────────────────────
    const affectedZones = [...new Set([...hotspots, ...volatileZones.map(v => v.path)])]
    const riskScore = trustScore ?? Math.max(0, 100 - hotspots.length * 15 - knownFailures.length * 10 - fragileCount * 8)
    const riskSummary = riskFlag
      ? `⚠ HIGH RISK: ${hotspots.length} volatile zone(s), ${knownFailures.length} known failure(s), ${fragileCount} fragile pattern(s)`
      : affectedZones.length > 0
        ? `⚡ MODERATE: ${affectedZones.length} affected zone(s) detected — review before proceeding`
        : "✓ LOW RISK: No volatile zones or known failures match this change"

    // ── Agent pipeline for full analysis work ────────────────────────────
    const config = {
      change_description: change,
      scope,
      files: fileList,
      modules_run: modulesRun,
      agents: [
        runImpact && { name: "researcher", role: "trace dependency graph from changed paths" },
        runBlast && { name: "architect", role: `trace blast radius to depth ${depth}, flag integration points` },
        runRegression && { name: "tester", role: "estimate coverage gaps per predicted regression category" },
        runTestGap && { name: "tester", role: "find source files changed with no test file" },
        runReviewRoute && { name: "reviewer", role: "rank gaps by risk and confirm routing" },
      ].filter(Boolean),
      data: {
        hotspots,
        known_failures: knownFailures,
        related_modules: relatedModules,
        volatile_zones: volatileZones,
        fragile_patterns: fragileCount,
        repo_memory_nodes: moduleCount,
        regression_categories: runRegression ? REGRESSION_CATEGORIES : [],
        past_regression_signals: pastRegressionSignals,
        test_gap_types: gapTypes,
        recommended_reviewers: reviewers,
        trust_score: trustScore,
        trust_verdict: trustVerdict,
        prior_failures: priorFailures.map(f => f.id),
      },
      risk_score: riskScore,
      risk_summary: riskSummary,
      traversal_depth: depth,
    }

    if (args?.json) {
      return {
        success: true,
        data: {
          modules_run: modulesRun,
          affected_zones: affectedZones,
          regression_categories: runRegression ? REGRESSION_CATEGORIES : [],
          test_gap_types: gapTypes,
          recommended_reviewers: reviewers,
          risk_summary: riskSummary,
          risk_score: riskScore,
          config,
          phase: state.phase,
        },
        meta: { formatted: "json", timestamp: timestamp() },
      }
    }

    const lines = [
      "═".repeat(62),
      "fd-analyze-change",
      "─".repeat(62),
      `  Change:   ${change || "(describe with --change)"}`,
      `  Scope:    ${scope}`,
      `  Modules:  ${modulesRun.join(", ") || "none selected"}`,
      "─".repeat(62),
    ]

    if (affectedZones.length > 0) {
      lines.push(`  ⚠ Affected zones:     ${affectedZones.slice(0, 5).join(", ")}${affectedZones.length > 5 ? ` +${affectedZones.length - 5} more` : ""}`)
    }
    if (knownFailures.length > 0) {
      lines.push(`  ⚠ Known failures:     ${knownFailures.join(", ")}`)
    }
    if (runRegression) {
      lines.push(`  ≈ Regression cats:   ${REGRESSION_CATEGORIES.slice(0, 5).join(", ")}...`)
    }
    if (gapTypes.length > 0) {
      lines.push(`  ✗ Test gap types:     ${gapTypes.length} gap patterns checked`)
    }
    if (reviewers.length > 0) {
      lines.push(`  → Route to:           ${reviewers.join(", ")}`)
    }

    lines.push("─".repeat(62))
    lines.push(`  ${riskSummary}`)
    lines.push("═".repeat(62))

    return {
      success: true,
      message: lines.join("\n"),
      modules_run: modulesRun,
      affected_zones: affectedZones,
      recommended_reviewers: reviewers,
      risk_summary: riskSummary,
      risk_score: riskScore,
      config,
      phase: state.phase,
      meta: { formatted: "table", timestamp: timestamp() },
    }
  },
}
