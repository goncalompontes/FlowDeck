/**
 * Plugin Loader Service
 *
 * Orchestrates auto-update and lazy-loading of the real FlowDeck plugin
 * from the repo clone at `~/.local/share/flowdeck/`.
 *
 * All operations are wrapped in try/catch so the plugin always falls back
 * to the bundled copy — the loader NEVER blocks startup.
 */

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import type { Plugin } from "@opencode-ai/plugin"

const DEFAULT_INSTALL_DIR = join(homedir(), ".local", "share", "flowdeck")

/** Resolve the install directory from env or default. */
export function getInstallDir(): string {
  const env = process.env.FLOWDECK_INSTALL_DIR

  if (!env) return DEFAULT_INSTALL_DIR

  try {
    return resolve(env)
  } catch {
    console.warn("[flowdeck-loader] could not resolve FLOWDECK_INSTALL_DIR — using default")
  }

  return DEFAULT_INSTALL_DIR
}

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@dv.nghiem/flowdeck/latest"
const REPO_URL = "https://github.com/DVNghiem/FlowDeck.git"

export interface LoaderResult {
  hooks: Awaited<ReturnType<Plugin>>
  updateApplied: boolean
  updateInfo?: { from: string; to: string }
}

/**
 * Check npm registry for latest version. Returns version info or null.
 */
export async function checkNpmRegistry(): Promise<{
  latest: string
  updateAvailable: boolean
  current: string
} | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2_000)
    const response = await fetch(NPM_REGISTRY_URL, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) return null

    const data = (await response.json()) as { version?: string }
    if (!data.version) return null

    const { createRequire } = await import("module")
    const require = createRequire(import.meta.url)
    const pkg = require("../../package.json") as { version?: string }
    const current = pkg.version ?? "0.0.0"

    const clean = (v: string) => v.split("-")[0].split(".").map(Number)
    const cv = clean(current)
    const lv = clean(data.version)
    const len = Math.max(cv.length, lv.length)

    let updateAvailable = false
    for (let i = 0; i < len; i++) {
      if ((cv[i] ?? 0) < (lv[i] ?? 0)) {
        updateAvailable = true
        break
      }
      if ((cv[i] ?? 0) > (lv[i] ?? 0)) break
    }

    return { latest: data.version, updateAvailable, current }
  } catch (e) {
    console.warn("[flowdeck-loader]", "npm registry check failed:", (e as Error)?.message ?? "unknown")
    return null
  }
}

/**
 * Ensure the repo clone exists at getInstallDir().
 * Clones if missing, pulls if present.
 * Returns the install directory path.
 */
export function ensureRepoClone(): string {
  if (existsSync(join(getInstallDir(), ".git"))) {
    try {
      execFileSync("git", ["pull", "--quiet"], {
        cwd: getInstallDir(),
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        timeout: 30_000,
      })
      // Log the pulled commit hash
      try {
        const headHash = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: getInstallDir(),
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10_000,
        }).trim()
        console.warn("[flowdeck-loader]", "updated to commit", headHash.slice(0, 12))
      } catch { /* non-fatal */ }
    } catch (e) {
      console.warn("[flowdeck-loader]", "git pull failed:", (e as Error)?.message ?? "unknown")
    }
  } else {
    mkdirSync(getInstallDir(), { recursive: true })
    try {
      execFileSync("git", ["clone", "--depth", "1", "--quiet", REPO_URL, getInstallDir()], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60_000,
      })
      // Log the cloned commit hash for audit trail
      try {
        const headHash = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: getInstallDir(),
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 10_000,
        }).trim()
        console.warn("[flowdeck-loader]", "cloned at commit", headHash.slice(0, 12))
      } catch { /* non-fatal */ }
    } catch (e) {
      console.warn("[flowdeck-loader]", "git clone failed:", (e as Error)?.message ?? "unknown")
    }
  }
  return getInstallDir()
}

/**
 * Build the plugin in the repo clone. Non-fatal if build fails.
 */
export function buildPlugin(installDir: string): void {
  try {
    execFileSync("bun", ["run", "build"], {
      cwd: installDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 120_000,
    })
  } catch (e) {
    console.warn("[flowdeck-loader]", "build failed:", (e as Error)?.message ?? "unknown")
  }
}

/**
 * Load and return the real plugin factory from the repo clone.
 * Returns null if loading fails.
 */
export async function loadPluginFromRepo(
  installDir: string,
): Promise<Plugin | null> {
  const pluginEntry = join(installDir, "dist", "plugin", "index.js")
  if (!existsSync(pluginEntry)) return null
  try {
    const pluginModule = await import(`file://${pluginEntry}`)
    const defaultExport = pluginModule.default ?? pluginModule
    if (typeof defaultExport !== "function") return null
    return defaultExport
  } catch (e) {
    console.warn("[flowdeck-loader]", "load plugin from repo failed:", (e as Error)?.message ?? "unknown")
    return null
  }
}
