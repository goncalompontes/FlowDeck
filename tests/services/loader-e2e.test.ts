/**
 * End-to-End Integration Test — Auto-Update Loader
 *
 * Tests the full lifecycle of the plugin loader in src/index.ts:
 *   checkNpmRegistry → npm install (if update) → ensureRepoClone → buildPlugin → loadPluginFromRepo → fallback
 *
 * Mocks all external dependencies to avoid network/git/bun calls.
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Local mock variables (used inside vi.mock factories) ───────────────────────
// These MUST be module-level so the hoisted vi.mock factory can access them.

const mockCheckNpmRegistry = vi.fn()
const mockEnsureRepoClone = vi.fn()
const mockBuildPlugin = vi.fn()
const mockLoadPluginFromRepo = vi.fn()
const mockExecFileSync = vi.fn()
const mockBundledFactory = vi.fn()

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock module (createRequire) so that require.resolve("@dv.nghiem/flowdeck/package.json")
// doesn't fail — the package is not installed in node_modules during tests.
vi.mock("module", () => ({
  createRequire: vi.fn(() => ({
    resolve: vi.fn(() => "/tmp/node_modules/@dv.nghiem/flowdeck/package.json"),
  })),
}))

// Mock the plugin-loader module (all sub-functions called by src/index.ts)
// Use wrapper functions that delegate to local mocks to preserve proper Mock types.
vi.mock("../../src/services/plugin-loader", () => ({
  checkNpmRegistry: (...args: unknown[]) => mockCheckNpmRegistry(...args),
  ensureRepoClone: (...args: unknown[]) => mockEnsureRepoClone(...args),
  buildPlugin: (...args: unknown[]) => mockBuildPlugin(...args),
  loadPluginFromRepo: (...args: unknown[]) => mockLoadPluginFromRepo(...args),
}))

// Mock execFileSync (used for npm install inside src/index.ts)
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

// Mock the bundled plugin fallback
vi.mock("../../src/plugin/index", () => ({
  default: mockBundledFactory,
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FlowDeck auto-update loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should check npm, install update, clone repo, build, and load from repo", async () => {
    // Arrange
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

    // Act
    const result = await plugin({ directory: "/tmp/test" } as any)

    // Assert
    expect(mockCheckNpmRegistry).toHaveBeenCalledOnce()
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "--ignore-scripts", "@dv.nghiem/flowdeck@latest"],
      expect.objectContaining({ timeout: 60_000 }),
    )
    expect(mockEnsureRepoClone).toHaveBeenCalledOnce()
    expect(mockBuildPlugin).toHaveBeenCalledWith("/home/user/.local/share/flowdeck")
    expect(mockLoadPluginFromRepo).toHaveBeenCalledWith("/home/user/.local/share/flowdeck")
    expect(mockRepoFactory).toHaveBeenCalledWith({ directory: "/tmp/test" })
    expect(mockBundledFactory).not.toHaveBeenCalled()
    expect(result).toEqual({ name: "repo-plugin" })
  })

  it("should skip npm install when no update available", async () => {
    // Arrange
    const { default: plugin } = await import("../../src/index")

    mockCheckNpmRegistry.mockResolvedValue({
      updateAvailable: false,
      latest: "0.6.0",
      current: "0.6.0",
    })
    mockEnsureRepoClone.mockReturnValue("/home/user/.local/share/flowdeck")
    mockLoadPluginFromRepo.mockResolvedValue(vi.fn() as any)

    // Act
    await plugin({ directory: "/tmp/test" } as any)

    // Assert
    expect(mockCheckNpmRegistry).toHaveBeenCalledOnce()
    const npmCalls = mockExecFileSync.mock.calls.filter(
      (c: unknown[]) => c[0] === "npm",
    )
    expect(npmCalls).toHaveLength(0)
  })

  it("should fall back to bundled plugin when repo load fails", async () => {
    // Arrange
    const { default: plugin } = await import("../../src/index")

    mockLoadPluginFromRepo.mockResolvedValue(null)
    mockBundledFactory.mockResolvedValue({ name: "bundled-plugin" })

    // Act
    const result = await plugin({ directory: "/tmp/test" } as any)

    // Assert
    expect(mockBundledFactory).toHaveBeenCalledOnce()
    expect(result).toEqual({ name: "bundled-plugin" })
  })

  it("should fall back when all update steps fail", async () => {
    // Arrange
    const { default: plugin } = await import("../../src/index")

    mockCheckNpmRegistry.mockRejectedValue(new Error("Network error"))
    mockLoadPluginFromRepo.mockResolvedValue(null)
    mockBundledFactory.mockResolvedValue({ name: "bundled-plugin" })

    // Act
    const result = await plugin({ directory: "/tmp/test" } as any)

    // Assert
    expect(mockBundledFactory).toHaveBeenCalledOnce()
    expect(result).toEqual({ name: "bundled-plugin" })
  })

  it("should pass --ignore-scripts flag to npm install", async () => {
    // Arrange
    const { default: plugin } = await import("../../src/index")

    mockCheckNpmRegistry.mockResolvedValue({
      updateAvailable: true,
      latest: "0.7.0",
      current: "0.6.0",
    })
    mockExecFileSync.mockImplementation(() => "")
    mockLoadPluginFromRepo.mockResolvedValue(vi.fn() as any)

    // Act
    await plugin({ directory: "/tmp/test" } as any)

    // Assert
    const npmCalls = mockExecFileSync.mock.calls.filter(
      (c: unknown[]) => c[0] === "npm",
    )
    expect(npmCalls.length).toBeGreaterThanOrEqual(1)
    const args = npmCalls[0][1] as string[]
    expect(args).toContain("--ignore-scripts")
  })
})
