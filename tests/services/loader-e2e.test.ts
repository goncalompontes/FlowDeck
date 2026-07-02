/**
 * End-to-End Integration Test — Auto-Update Loader
 *
 * Tests the full lifecycle of the plugin loader in src/index.ts:
 *   checkNpmRegistry → npm install (if update) → ensureRepoClone → buildPlugin → loadPluginFromRepo → fallback
 *
 * SAFETY: Does NOT mock ../../src/plugin/index. Fallback tests always load the
 * real bundled plugin. This avoids the cross-test leakage seen in the previous
 * version where a top-level vi.mock("../../src/plugin/index") persisted into
 * removed-tools.test.ts and returned undefined.
 *
 * Vi API notes (Bun vitest limitations):
 * - vi.doMock, vi.unmock, vi.mocked, vi.importActual are NOT available in Bun
 * - vi.spyOn IS available — used to intercept execFileSync on the real module
 * - vi.fn() IS available — used for all plugin-loader mock functions
 *
 * Temp override: src/index.ts skips the update cycle when NODE_ENV === "test".
 * This test sets NODE_ENV to "development" so the loader runs for real.
 * It is restored in afterAll.
 */

import { vi, describe, it, expect, beforeEach, afterAll } from "vitest"

// ── Module-level mock variables ───────────────────────────────────────────────
// Reassigned in beforeEach so each test gets fresh mocks.
// The vi.mock factories close over these variables — reassignment takes effect
// per test because the factory delegates via (...args) => variable(...args).

let mockCheckNpmRegistry = vi.fn()
let mockEnsureRepoClone = vi.fn()
let mockBuildPlugin = vi.fn()
let mockLoadPluginFromRepo = vi.fn()

// ── Top-level mocks ───────────────────────────────────────────────────────────
// These modules are ONLY imported by the auto-update loader, so no other test
// file is affected by these mocks.

vi.mock("../../src/services/plugin-loader", () => ({
  checkNpmRegistry: (...args: unknown[]) => mockCheckNpmRegistry(...args),
  ensureRepoClone: (...args: unknown[]) => mockEnsureRepoClone(...args),
  buildPlugin: (...args: unknown[]) => mockBuildPlugin(...args),
  loadPluginFromRepo: (...args: unknown[]) => mockLoadPluginFromRepo(...args),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("auto-update loader end-to-end", () => {
  afterAll(() => {
    // Restore NODE_ENV so other tests see the original value
    process.env.NODE_ENV = "test"
  })

  beforeEach(() => {
    // Override NODE_ENV so the loader doesn't skip the update cycle
    process.env.NODE_ENV = "development"
    mockCheckNpmRegistry = vi.fn()
    mockEnsureRepoClone = vi.fn()
    mockBuildPlugin = vi.fn()
    mockLoadPluginFromRepo = vi.fn()
  })

  it("should check npm, install update, clone repo, build, and load from repo", async () => {
    // Use vi.spyOn on the real node:child_process module to intercept execFileSync
    // This preserves spawnSync and other exports needed by transitive deps.
    const cp = await import("node:child_process")
    const execSpy = vi.spyOn(cp, "execFileSync").mockImplementation(() => "" as any)

    const { default: plugin } = await import("../../src/index")

    const mockRepoFactory = vi.fn().mockResolvedValue({ name: "repo-plugin" })

    mockCheckNpmRegistry.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    mockEnsureRepoClone.mockReturnValue("/home/user/.local/share/flowdeck")
    mockBuildPlugin.mockImplementation(() => {})
    mockLoadPluginFromRepo.mockResolvedValue(mockRepoFactory as any)

    const result = await plugin({ directory: "/tmp/test" } as any)

    expect(mockCheckNpmRegistry).toHaveBeenCalledOnce()
    expect(execSpy).toHaveBeenCalledWith(
      "npm",
      ["install", "--ignore-scripts", "@dv.nghiem/flowdeck@latest"],
      expect.objectContaining({ timeout: 60_000 }),
    )
    expect(mockEnsureRepoClone).toHaveBeenCalledOnce()
    expect(mockBuildPlugin).toHaveBeenCalledWith("/home/user/.local/share/flowdeck")
    expect(mockLoadPluginFromRepo).toHaveBeenCalledWith("/home/user/.local/share/flowdeck")
    expect(mockRepoFactory).toHaveBeenCalledWith({ directory: "/tmp/test" })
    expect(result).toEqual({ name: "repo-plugin" })

    execSpy.mockRestore()
  })

  it("should skip npm install when no update available", async () => {
    const cp = await import("node:child_process")
    const execSpy = vi.spyOn(cp, "execFileSync").mockImplementation(() => "" as any)

    const { default: plugin } = await import("../../src/index")

    mockCheckNpmRegistry.mockResolvedValue({
      updateAvailable: false,
      latest: "0.6.0",
      current: "0.6.0",
    })
    mockEnsureRepoClone.mockReturnValue("/home/user/.local/share/flowdeck")
    mockLoadPluginFromRepo.mockResolvedValue(vi.fn() as any)

    await plugin({ directory: "/tmp/test" } as any)

    expect(mockCheckNpmRegistry).toHaveBeenCalledOnce()
    const npmCalls = execSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === "npm",
    )
    expect(npmCalls).toHaveLength(0)

    execSpy.mockRestore()
  })

  it("should fall back to bundled plugin when repo load fails", async () => {
    const { default: plugin } = await import("../../src/index")

    mockCheckNpmRegistry.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    mockEnsureRepoClone.mockReturnValue("/home/user/.local/share/flowdeck")
    mockBuildPlugin.mockImplementation(() => {})
    // repo load returns null — triggers fallback to bundled plugin
    mockLoadPluginFromRepo.mockResolvedValue(null)

    const result = await plugin({ directory: "/tmp/test" } as any)

    // Fallback loaded the real src/plugin/index.ts which returns the full plugin
    expect(result).toBeDefined()
    expect(result).toHaveProperty("name", "@dv.nghiem/flowdeck")
    expect(result).toHaveProperty("tool")
    const toolNames = Object.keys((result as any).tool ?? {})
    expect(toolNames).toContain("planning-state")
    expect(toolNames).toContain("fdx-read")
    expect(toolNames).toContain("codegraph")
  })

  it("should fall back when all update steps fail", async () => {
    const { default: plugin } = await import("../../src/index")

    // All update steps fail (checkNpmRegistry rejects)
    mockCheckNpmRegistry.mockRejectedValue(new Error("Network error"))
    mockLoadPluginFromRepo.mockResolvedValue(null)

    const result = await plugin({ directory: "/tmp/test" } as any)

    // Fallback to real bundled plugin
    expect(result).toBeDefined()
    expect(result).toHaveProperty("name", "@dv.nghiem/flowdeck")
    expect(result).toHaveProperty("tool")
    const toolNames = Object.keys((result as any).tool ?? {})
    expect(toolNames).toContain("planning-state")
    expect(toolNames).toContain("fdx-read")
    expect(toolNames).toContain("codegraph")
  })

  it("should pass --ignore-scripts to npm install", async () => {
    const cp = await import("node:child_process")
    const execSpy = vi.spyOn(cp, "execFileSync").mockImplementation(() => "" as any)

    const { default: plugin } = await import("../../src/index")

    mockCheckNpmRegistry.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    mockEnsureRepoClone.mockReturnValue("/home/user/.local/share/flowdeck")
    mockBuildPlugin.mockImplementation(() => {})
    mockLoadPluginFromRepo.mockResolvedValue(vi.fn() as any)

    await plugin({ directory: "/tmp/test" } as any)

    const npmCalls = execSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === "npm",
    )
    expect(npmCalls.length).toBeGreaterThanOrEqual(1)
    const args = npmCalls[0][1] as string[]
    expect(args).toContain("--ignore-scripts")

    execSpy.mockRestore()
  })
})
