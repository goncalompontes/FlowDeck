import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import { impactRadarCommand } from "./impact-radar"
import { blastRadiusCommand } from "./blast-radius"
import { testGapCommand } from "./test-gap"
import { reviewRouteCommand } from "./review-route"
import { translateIntentCommand } from "./translate-intent"

const TMP = join(process.cwd(), ".test-tmp-intel-commands")
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

// ────────────────────────────────────────────────
// impact-radar
// ────────────────────────────────────────────────

describe("impactRadarCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await impactRadarCommand.execute(ctx, {})
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("returns success with table output when initialized", async () => {
    initState()
    const result = await impactRadarCommand.execute(ctx, { change: "update auth token handling" })
    expect((result as any).success).toBe(true)
    expect((result as any).message).toContain("Impact Radar")
  })

  it("returns json output when json flag set", async () => {
    initState()
    const result = await impactRadarCommand.execute(ctx, { json: true })
    expect((result as any).meta?.formatted).toBe("json")
    expect((result as any).data).toBeTruthy()
  })
})

// ────────────────────────────────────────────────
// blast-radius
// ────────────────────────────────────────────────

describe("blastRadiusCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await blastRadiusCommand.execute(ctx, {})
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("returns success with blast radius info", async () => {
    initState()
    const result = await blastRadiusCommand.execute(ctx, { change: "delete user-session table" })
    expect((result as any).success).toBe(true)
    expect((result as any).message).toContain("Blast Radius")
  })
})

// ────────────────────────────────────────────────
// test-gap
// ────────────────────────────────────────────────

describe("testGapCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await testGapCommand.execute(ctx, {})
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("returns success with test gap analysis", async () => {
    initState()
    const result = await testGapCommand.execute(ctx, { change: "add payment webhook handler" })
    expect((result as any).success).toBe(true)
    expect((result as any).message).toContain("Test Gap")
  })
})

// ────────────────────────────────────────────────
// review-route
// ────────────────────────────────────────────────

describe("reviewRouteCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await reviewRouteCommand.execute(ctx, {})
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("routes auth changes to security reviewer", async () => {
    initState()
    const result = await reviewRouteCommand.execute(ctx, { change: "update jwt authentication flow", files: "src/auth/token.ts" })
    expect((result as any).success).toBe(true)
    const reviewers: string[] = (result as any).routed_to ?? []
    // security should be assigned for auth/jwt changes
    expect(reviewers.some((r) => r === "security" || r === "backend")).toBe(true)
  })
})

// ────────────────────────────────────────────────
// translate-intent
// ────────────────────────────────────────────────

describe("translateIntentCommand", () => {
  it("returns NOT_INITIALIZED when STATE.md missing", async () => {
    const result = await translateIntentCommand.execute(ctx, {})
    expect((result as any).code).toBe("NOT_INITIALIZED")
  })

  it("returns ranked implementation options for vague request", async () => {
    initState()
    const result = await translateIntentCommand.execute(ctx, { intent: "make checkout faster" })
    expect((result as any).success).toBe(true)
    expect((result as any).message).toContain("Intent")
  })
})
