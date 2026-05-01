import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { askCommand } from "./ask"

const TMP = join(process.cwd(), ".test-tmp-ask")
const ctx = { directory: TMP }

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

describe("/fd-ask", () => {
  it("returns error when no task given", async () => {
    const r = await askCommand.execute(ctx, {})
    expect(r.code).toBe("NO_TASK")
    expect(r.examples).toBeDefined()
  })

  it("routes 'system design' to @architect", async () => {
    const r = await askCommand.execute(ctx, { task: "system design for a notification service" })
    expect(r.dispatch?.agent).toBe("@architect")
  })

  it("routes 'security vulnerability' to @security-auditor", async () => {
    const r = await askCommand.execute(ctx, { task: "security vulnerability in the payment API" })
    expect(r.dispatch?.agent).toBe("@security-auditor")
  })

  it("routes 'explain how auth works' to @code-explorer", async () => {
    const r = await askCommand.execute(ctx, { task: "explain how auth works in this codebase" })
    expect(r.dispatch?.agent).toBe("@code-explorer")
  })

  it("routes 'debug crash' to @debug-specialist", async () => {
    const r = await askCommand.execute(ctx, { task: "debug the crash in checkout" })
    expect(r.dispatch?.agent).toBe("@debug-specialist")
  })

  it("routes 'performance bottleneck' to @performance-optimizer", async () => {
    const r = await askCommand.execute(ctx, { task: "find performance bottleneck in the API" })
    expect(r.dispatch?.agent).toBe("@performance-optimizer")
  })

  it("routes 'impact assessment' to @researcher with radar", async () => {
    const r = await askCommand.execute(ctx, { task: "impact assessment of changing auth module" })
    expect(r.dispatch?.agent).toBe("@researcher")
    expect(r.dispatch?.impact_radar).toBeDefined()
  })

  it("respects --agent override", async () => {
    const r = await askCommand.execute(ctx, { task: "anything", agent: "tester" })
    expect(r.dispatch?.agent).toBe("@tester")
  })

  it("returns json when --json flag set", async () => {
    const r = await askCommand.execute(ctx, { task: "write tests for payments", json: true })
    expect(r.data?.agent).toBe("@tester")
    expect(r.meta?.formatted).toBe("json")
  })

  it("falls back to @orchestrator for unknown tasks", async () => {
    const r = await askCommand.execute(ctx, { task: "xyzzypqrabcdefunk12345" })
    expect(r.dispatch?.agent).toBe("@orchestrator")
  })
})
