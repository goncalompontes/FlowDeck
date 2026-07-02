/**
 * Plugin Loader Tests
 *
 * Covers:
 *  - checkNpmRegistry: returns correct data (mock fetch), null on error
 *  - ensureRepoClone: creates directory with .git (mock execSync)
 *  - buildPlugin: does not throw
 *  - loadPluginFromRepo: returns null when dist doesn't exist
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir, tmpdir } from "os"
import { mkdtempSync, rmSync } from "fs"

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Mock execFileSync before importing the module under test
const mockExecFileSync = vi.fn()
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}))

// ── Module under test ─────────────────────────────────────────────────────────
import {
  checkNpmRegistry,
  ensureRepoClone,
  buildPlugin,
  loadPluginFromRepo,
  getInstallDir,
} from "@/services/plugin-loader"

describe("checkNpmRegistry", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should return version info when fetch succeeds and update is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.7.0" }), { status: 200 }),
    )

    const result = await checkNpmRegistry()

    expect(result).not.toBeNull()
    expect(result!.latest).toBe("0.7.0")
    expect(result!.updateAvailable).toBe(true)
    expect(result!.current).toBeTypeOf("string")
  })

  it("should return version info when no update is needed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.6.0" }), { status: 200 }),
    )

    const result = await checkNpmRegistry()

    expect(result).not.toBeNull()
    expect(result!.latest).toBe("0.6.0")
    expect(result!.updateAvailable).toBe(false)
  })

  it("should return null on network error (fetch throws)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network failure"))

    const result = await checkNpmRegistry()
    expect(result).toBeNull()
  })

  it("should return null on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 }),
    )

    const result = await checkNpmRegistry()
    expect(result).toBeNull()
  })

  it("should return null when version field is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    )

    const result = await checkNpmRegistry()
    expect(result).toBeNull()
  })

  it("should return null on malformed JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not-json", { status: 200 }),
    )

    const result = await checkNpmRegistry()
    expect(result).toBeNull()
  })
})

describe("ensureRepoClone", () => {
  const originalDir = process.env.FLOWDECK_INSTALL_DIR
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = mkdtempSync(join(homedir(), ".flowdeck-test-"))
    process.env.FLOWDECK_INSTALL_DIR = tempDir
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    if (originalDir !== undefined) {
      process.env.FLOWDECK_INSTALL_DIR = originalDir
    } else {
      delete process.env.FLOWDECK_INSTALL_DIR
    }
    vi.resetAllMocks()
  })

  it("should clone repo when directory has no .git", () => {
    mockExecFileSync.mockImplementation(() => undefined)

    const result = ensureRepoClone()

    expect(result).toBe(tempDir)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["clone"]),
      expect.objectContaining({ timeout: 60_000 }),
    )
  })

  it("should pull when directory already has .git", () => {
    mkdirSync(join(tempDir, ".git"), { recursive: true })
    mockExecFileSync.mockImplementation(() => undefined)

    const result = ensureRepoClone()

    expect(result).toBe(tempDir)
    // Should do git pull, not git clone
    const calls = mockExecFileSync.mock.calls.map((c: unknown[]) => ({
      cmd: String(c[0] ?? ""),
      args: (c[1] ?? []) as string[],
    }))
    expect(calls.some((c) => c.cmd === "git" && c.args.includes("pull"))).toBe(true)
    expect(calls.some((c) => c.cmd === "git" && c.args.includes("clone"))).toBe(false)
  })

  it("should not throw when git command fails", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("git: command not found")
    })

    expect(() => ensureRepoClone()).not.toThrow()
    // Should still return the install dir
    expect(ensureRepoClone()).toBe(tempDir)
  })

  it("should create the install directory when it does not exist", () => {
    // Remove the temp dir so it doesn't exist
    rmSync(tempDir, { recursive: true, force: true })
    mockExecFileSync.mockImplementation(() => undefined)

    const result = ensureRepoClone()

    expect(result).toBe(tempDir)
    expect(existsSync(tempDir)).toBe(true)
  })
})

describe("buildPlugin", () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = mkdtempSync(join(tmpdir(), "flowdeck-build-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetAllMocks()
  })

  it("should call bun run build with correct arguments", () => {
    mockExecFileSync.mockImplementation(() => undefined)

    buildPlugin(tempDir)

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "bun",
      ["run", "build"],
      expect.objectContaining({
        cwd: tempDir,
        timeout: 120_000,
      }),
    )
  })

  it("should not throw when build fails", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("bun: command not found")
    })

    expect(() => buildPlugin(tempDir)).not.toThrow()
  })
})

describe("loadPluginFromRepo", () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = mkdtempSync(join(tmpdir(), "flowdeck-load-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetAllMocks()
  })

  it("should return null when dist/index.js does not exist", async () => {
    const result = await loadPluginFromRepo(tempDir)
    expect(result).toBeNull()
  })

  it("should return null when dist directory does not exist", async () => {
    const result = await loadPluginFromRepo(tempDir)
    expect(result).toBeNull()
  })

  it("should return null when the module has no default export", async () => {
    const distDir = join(tempDir, "dist")
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, "index.js"), 'export const foo = "bar"\n', "utf-8")

    const result = await loadPluginFromRepo(tempDir)
    expect(result).toBeNull()
  })

  it("should return null when the default export is not a function", async () => {
    const distDir = join(tempDir, "dist")
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, "index.js"), "export default 42\n", "utf-8")

    const result = await loadPluginFromRepo(tempDir)
    expect(result).toBeNull()
  })
})

// ── Supply chain integrity tests (RED: will fail until getInstallDir validates) ──

describe("getInstallDir path validation (RED)", () => {
  const originalDir = process.env.FLOWDECK_INSTALL_DIR
  const defaultDir = join(homedir(), ".local", "share", "flowdeck")

  afterEach(() => {
    if (originalDir !== undefined) {
      process.env.FLOWDECK_INSTALL_DIR = originalDir
    } else {
      delete process.env.FLOWDECK_INSTALL_DIR
    }
  })

  it("should reject path outside home and return default", () => {
    process.env.FLOWDECK_INSTALL_DIR = "/tmp/malicious"

    const result = getInstallDir()

    expect(result).toBe(defaultDir)
    expect(result).not.toContain("/tmp/malicious")
  })

  it("should accept path under home", () => {
    const customPath = join(homedir(), ".my-custom-dir")
    process.env.FLOWDECK_INSTALL_DIR = customPath

    const result = getInstallDir()

    expect(result).toBe(customPath)
  })

  it("should resolve .. traversal back to safe path", () => {
    process.env.FLOWDECK_INSTALL_DIR = join(homedir(), "..", "..", "etc")

    const result = getInstallDir()

    expect(result).toBe(defaultDir)
  })
})

// ── execFileSync safety tests (RED: will fail until implementation is fixed) ──

describe("plugin-loader command injection safety (RED)", () => {
  const originalDir = process.env.FLOWDECK_INSTALL_DIR
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecFileSync.mockImplementation(() => undefined)
    tempDir = mkdtempSync(join(homedir(), ".flowdeck-injection-"))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    if (originalDir !== undefined) {
      process.env.FLOWDECK_INSTALL_DIR = originalDir
    } else {
      delete process.env.FLOWDECK_INSTALL_DIR
    }
    vi.resetAllMocks()
  })

  it("ensureRepoClone passes shell metacharacters literally in args array", () => {
    // Create a path under home with shell metacharacters
    // Semicolons are valid in Unix directory names; execFileSync with an
    // args array treats them literally, never as shell command separators.
    const metacharPath = join(homedir(), ".flowdeck-injection-; rm -rf /")
    process.env.FLOWDECK_INSTALL_DIR = metacharPath

    // Ensure no .git so it takes the clone path
    mockExecFileSync.mockImplementation(() => undefined)

    try {
      ensureRepoClone()
    } finally {
      rmSync(metacharPath, { recursive: true, force: true })
    }

    // execFileSync must have been called with "git" as the command
    expect(mockExecFileSync).toHaveBeenCalled()
    const calls = mockExecFileSync.mock.calls
    const gitCall = calls.find((c: unknown[]) => c[0] === "git") as unknown[] | undefined
    expect(gitCall).toBeDefined()
    if (!gitCall) throw new Error("expected a git execFileSync call")

    // The args array (second argument) must be an array, not a string
    expect(Array.isArray(gitCall[1])).toBe(true)

    // The literal metacharacter path must appear verbatim as a single arg
    const installDir = getInstallDir()
    expect(gitCall[1]).toContain(installDir)
  })

  it("buildPlugin uses execFileSync with bun command and args array", () => {
    mockExecFileSync.mockImplementation(() => undefined)

    buildPlugin(tempDir)

    expect(mockExecFileSync).toHaveBeenCalled()
    const calls = mockExecFileSync.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe("bun")
    expect(Array.isArray(calls[0][1])).toBe(true)
    expect(calls[0][1]).toContain("run")
    expect(calls[0][1]).toContain("build")
  })

  it("ensureRepoClone git pull uses execFileSync with args array", () => {
    process.env.FLOWDECK_INSTALL_DIR = tempDir
    mkdirSync(join(tempDir, ".git"), { recursive: true })
    mockExecFileSync.mockImplementation(() => undefined)

    ensureRepoClone()

    expect(mockExecFileSync).toHaveBeenCalled()
    const calls = mockExecFileSync.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(1)

    // First call should be git pull with args array
    const gitCalls = calls.filter((c: unknown[]) => c[0] === "git")
    expect(gitCalls.length).toBeGreaterThanOrEqual(1)
    const pullCall = gitCalls[0]
    expect(Array.isArray(pullCall[1])).toBe(true)
    expect(pullCall[1]).toContain("pull")
  })
})
