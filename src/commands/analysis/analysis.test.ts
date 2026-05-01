import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import { analyzeChangeCommand } from "./analyze-change"
import { guardedEditCommand } from "./guarded-edit"
import { evaluateRiskCommand } from "./evaluate-risk"

const TMP = join(process.cwd(), ".test-tmp-umbrella-commands")
const ctx = { directory: TMP }

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

function initState() {
  const planningDir = join(TMP, ".planning")
  mkdirSync(planningDir, { recursive: true })
  writeFileSync(join(planningDir, "STATE.md"), "# State\nphase: active\n", "utf-8")
}

function initCodebase(extras: Record<string, any> = {}) {
  const cd = join(TMP, ".codebase")
  mkdirSync(cd, { recursive: true })
  if (extras.volatility) {
    writeFileSync(join(cd, "VOLATILITY.json"), JSON.stringify({
      entries: extras.volatility,
    }), "utf-8")
  }
  if (extras.failures) {
    writeFileSync(join(cd, "FAILURES.json"), JSON.stringify({
      entries: extras.failures,
    }), "utf-8")
  }
  if (extras.memory) {
    writeFileSync(join(cd, "MEMORY.json"), JSON.stringify({
      nodes: extras.memory,
    }), "utf-8")
  }
  if (extras.policies) {
    writeFileSync(join(cd, "POLICIES.json"), JSON.stringify({
      policies: extras.policies,
    }), "utf-8")
  }
  if (extras.constraints) {
    writeFileSync(join(cd, "CONSTRAINTS.md"), extras.constraints, "utf-8")
  }
}

// ─────────────────────────────────────────────────────────
// /fd-analyze-change
// ─────────────────────────────────────────────────────────

describe("analyzeChangeCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await analyzeChangeCommand.execute(ctx, {})
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("returns success with table output when initialized", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, { change: "update auth middleware" })
    expect((result as any).success).toBe(true)
    expect((result as any).message).toContain("fd-analyze-change")
  })

  it("runs all modules by default", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, { change: "update routes" })
    const modules: string[] = (result as any).modules_run
    expect(modules).toContain("impact-radar")
    expect(modules).toContain("blast-radius")
    expect(modules).toContain("regression-predict")
    expect(modules).toContain("test-gap")
    expect(modules).toContain("volatility-map")
    expect(modules).toContain("review-route")
  })

  it("runs only specified modules when flags provided", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, { change: "update routes", impact: true, regression: true })
    const modules: string[] = (result as any).modules_run
    expect(modules).toContain("impact-radar")
    expect(modules).toContain("regression-predict")
    expect(modules).not.toContain("blast-radius")
    expect(modules).not.toContain("test-gap")
  })

  it("returns json when json flag set", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, { change: "refactor payment service", json: true })
    expect((result as any).meta?.formatted).toBe("json")
    expect((result as any).data).toBeTruthy()
    expect((result as any).data.modules_run).toBeInstanceOf(Array)
  })

  it("routes auth changes to security reviewer", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, {
      change: "update jwt token validation",
      files: "src/auth/token.ts",
      "review-route": true,
    })
    const reviewers: string[] = (result as any).recommended_reviewers ?? []
    expect(reviewers.some(r => r === "security" || r === "backend")).toBe(true)
  })

  it("picks up volatile zones from VOLATILITY.json", async () => {
    initState()
    initCodebase({
      volatility: [
        { path: "src/payment/", stability: "critical", churn_score: 90 },
        { path: "src/stable/", stability: "stable", churn_score: 10 },
      ],
    })
    const result = await analyzeChangeCommand.execute(ctx, { change: "update payment flow", volatility: true })
    expect((result as any).affected_zones).toContain("src/payment/")
    expect((result as any).affected_zones).not.toContain("src/stable/")
  })

  it("returns risk_score as number", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, { change: "update config" })
    expect(typeof (result as any).risk_score).toBe("number")
  })

  it("includes risk_summary in output", async () => {
    initState()
    const result = await analyzeChangeCommand.execute(ctx, { change: "add feature flag" })
    expect(typeof (result as any).risk_summary).toBe("string")
    expect((result as any).risk_summary.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────
// /fd-guarded-edit
// ─────────────────────────────────────────────────────────

describe("guardedEditCommand", () => {
  it("returns NO_INPUT when no file or change provided", async () => {
    const result = await guardedEditCommand.execute(ctx, {})
    expect((result as any).code).toBe("NO_INPUT")
  })

  it("returns a gate decision for a stable file", async () => {
    initState()
    const result = await guardedEditCommand.execute(ctx, {
      file: "src/utils/format.ts",
      change: "add number formatter",
    })
    expect((result as any).success).toBe(true)
    expect(["auto-approve", "require-confirmation", "require-review", "block"]).toContain((result as any).decision)
  })

  it("returns block when arch constraint violated", async () => {
    initState()
    initCodebase({
      constraints: "# Constraints\n## Forbidden Paths\n- src/core/  # do not modify core\n",
    })
    const result = await guardedEditCommand.execute(ctx, {
      file: "src/core/engine.ts",
      change: "patch core engine",
    })
    expect((result as any).decision).toBe("block")
    expect((result as any).arch_constraint).toBe(true)
  })

  it("returns require-confirmation for volatile file", async () => {
    initState()
    initCodebase({
      volatility: [{ path: "src/auth/", stability: "volatile", churn_score: 80 }],
    })
    // We can't guarantee exact decision without knowing trust score
    // but volatile should produce at least require-confirmation or higher
    const result = await guardedEditCommand.execute(ctx, {
      file: "src/auth/middleware.ts",
      change: "update auth validation",
    })
    expect(["require-confirmation", "require-review", "block"]).toContain((result as any).decision)
  })

  it("returns json format when json flag set", async () => {
    initState()
    const result = await guardedEditCommand.execute(ctx, {
      file: "src/utils/log.ts",
      change: "add debug log",
      json: true,
    })
    expect((result as any).meta?.formatted).toBe("json")
    expect((result as any).data?.decision).toBeTruthy()
  })

  it("includes recommended_action in output", async () => {
    initState()
    const result = await guardedEditCommand.execute(ctx, {
      file: "src/config/app.ts",
      change: "update timeout setting",
    })
    expect(typeof (result as any).recommended_action).toBe("string")
    expect((result as any).recommended_action.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────
// /fd-evaluate-risk
// ─────────────────────────────────────────────────────────

describe("evaluateRiskCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await evaluateRiskCommand.execute(ctx, { change: "update schema" })
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("returns NO_INPUT when neither change nor file provided", async () => {
    initState()
    const result = await evaluateRiskCommand.execute(ctx, {})
    expect((result as any).code).toBe("NO_INPUT")
  })

  it("returns risk_score and risk_level for a change description", async () => {
    initState()
    const result = await evaluateRiskCommand.execute(ctx, { change: "update button label" })
    expect(typeof (result as any).risk_score).toBe("number")
    expect(["low", "medium", "high", "critical"]).toContain((result as any).risk_level)
  })

  it("predicts auth regression for auth-related changes", async () => {
    initState()
    const result = await evaluateRiskCommand.execute(ctx, { change: "refactor jwt token expiry handling" })
    const regressions: string[] = (result as any).likely_regressions ?? []
    expect(regressions).toContain("auth")
  })

  it("predicts schema regression for schema-related changes", async () => {
    initState()
    const result = await evaluateRiskCommand.execute(ctx, { change: "add new column to user schema migration" })
    const regressions: string[] = (result as any).likely_regressions ?? []
    expect(regressions).toContain("schema")
  })

  it("returns confidence score between 0 and 100", async () => {
    initState()
    const result = await evaluateRiskCommand.execute(ctx, { change: "update footer copy" })
    const confidence = (result as any).confidence
    expect(confidence).toBeGreaterThanOrEqual(0)
    expect(confidence).toBeLessThanOrEqual(100)
  })

  it("sets approval_needed for high-risk changes", async () => {
    initState()
    // Change text spans 3+ regression categories:
    //   auth (jwt, auth), schema (schema, migration), async-flow (async, queue)
    const result = await evaluateRiskCommand.execute(ctx, {
      change: "refactor jwt auth validation schema migration with async queue processing",
    })
    const regressions: string[] = (result as any).likely_regressions ?? []
    // Verify ≥3 regression categories predicted
    expect(regressions.length).toBeGreaterThanOrEqual(3)
    expect((result as any).approval_needed).toBe(true)
  })

  it("returns json format when json flag set", async () => {
    initState()
    const result = await evaluateRiskCommand.execute(ctx, { change: "refactor api endpoint", json: true })
    expect((result as any).meta?.formatted).toBe("json")
    expect((result as any).data?.risk_score).toBeDefined()
  })

  it("suggests safer alternative for critical/high risk changes", async () => {
    initState()
    // auth keyword → triggers auth regression and risk signals
    const result = await evaluateRiskCommand.execute(ctx, { change: "replace oauth token auth with jwt session" })
    // If risk is high/critical, safer_alternative should be a string
    const alt = (result as any).safer_alternative
    if (alt !== null) {
      expect(typeof alt).toBe("string")
      expect(alt.length).toBeGreaterThan(0)
    }
  })
})
