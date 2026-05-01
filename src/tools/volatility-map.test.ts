import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs"
import { join } from "path"
import { volatilityMapTool } from "./volatility-map"

const TMP = join(process.cwd(), ".test-tmp-volatility")
const ctx = { directory: TMP }

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
})

const stableEntry = { path: "src/utils", churn_score: 5, hotfix_count: 0, todo_count: 1, notes: [] }
const volatileEntry = { path: "src/auth", churn_score: 70, hotfix_count: 5, todo_count: 3, notes: ["High churn"] }
const criticalEntry = { path: "src/payment", churn_score: 90, hotfix_count: 8, todo_count: 10, notes: ["Fragile"] }

describe("volatility-map tool", () => {
  it("read on empty store returns empty entries", async () => {
    const result = JSON.parse(await volatilityMapTool.execute({ action: "read" }, ctx) as string)
    expect(result.entries).toEqual([])
  })

  it("write then read returns persisted entries with computed stability", async () => {
    await volatilityMapTool.execute({ action: "write", entries: [stableEntry, volatileEntry] }, ctx)
    const result = JSON.parse(await volatilityMapTool.execute({ action: "read" }, ctx) as string)
    expect(result.entries).toHaveLength(2)
    const stable = result.entries.find((e: any) => e.path === "src/utils")
    expect(stable.stability).toBe("stable")
    const vol = result.entries.find((e: any) => e.path === "src/auth")
    expect(["volatile", "critical"]).toContain(vol.stability)
  })

  it("query_hotspots returns only volatile/critical entries", async () => {
    await volatilityMapTool.execute({ action: "write", entries: [stableEntry, volatileEntry, criticalEntry] }, ctx)
    const result = JSON.parse(await volatilityMapTool.execute({ action: "query_hotspots" }, ctx) as string)
    expect(result.hotspots.every((h: any) => h.stability === "volatile" || h.stability === "critical")).toBe(true)
    // stable entry should not be in hotspots
    expect(result.hotspots.find((h: any) => h.path === "src/utils")).toBeUndefined()
  })

  it("update_entry merges onto existing entry", async () => {
    await volatilityMapTool.execute({ action: "write", entries: [stableEntry] }, ctx)
    await volatilityMapTool.execute({ action: "update_entry", entry: { ...stableEntry, path: "src/utils", churn_score: 60, notes: ["updated"] } }, ctx)
    const result = JSON.parse(await volatilityMapTool.execute({ action: "read" }, ctx) as string)
    const entry = result.entries.find((e: any) => e.path === "src/utils")
    expect(entry.churn_score).toBe(60)
    expect(entry.notes).toContain("updated")
  })

  it("write with empty entries returns error", async () => {
    const result = JSON.parse(await volatilityMapTool.execute({ action: "write" }, ctx) as string)
    expect(result.error).toBeTruthy()
  })
})
