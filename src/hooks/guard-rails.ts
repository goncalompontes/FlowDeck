import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { findWorkspaceRoot, getWorkspaceConfig, planningDir } from "../tools/planning-state-lib"
import { codebaseDir } from "../tools/codebase-state"

const PLANNING_DIR = ".planning"
const CONFIG_FILE = "config.json"
const STATE_FILE = "STATE.md"

// Build/deploy command patterns for bash detection
const BUILD_DEPLOY_PATTERNS = [
  "npm build", "npm run build", "bun build", "yarn build",
  "npm deploy", "yarn deploy", "bun deploy",
  "npm install", "yarn install", "bun install",
  "make build", "make deploy",
  "docker build", "docker push", "docker-compose",
  "git push", "git deploy",
  "gradle build", "mvn package", "ant build",
  "cargo build", "cargo deploy",
  "python setup.py", "pip install",
  "rails deploy", "rake deploy",
]

export type Severity = "warn" | "block" | null

/**
 * HOOK-03: Guard rails enforcement
 * Warns on write/edit tools during setup phase (plan_confirmed=false).
 * Blocks on write/edit tools during execution phase (plan_confirmed=true).
 * Checks .codebase/ existence per proposal spec line 412.
 * Detects bash build/deploy commands per proposal spec line 416.
 * Respects guard_enforcement override in config.json.
 */
export async function guardRailsHook(
  ctx: { directory: string },
  input: { tool: string },
  _output: any
): Promise<void> {
  const dir = ctx.directory
  const planningDirPath = join(dir, PLANNING_DIR)
  const codebaseDirectory = codebaseDir(dir)
  const configPath = join(planningDirPath, CONFIG_FILE)
  const statePath = join(planningDirPath, STATE_FILE)

  // HOOK-WS-02: Workspace-aware blocking for shared mode
  const workspaceRoot = findWorkspaceRoot(dir)
  if (workspaceRoot && dir !== workspaceRoot) {
    const config = getWorkspaceConfig(dir)
    if (config && config.workspace_mode === "shared" && !existsSync(planningDirPath)) {
      const msg = `No .planning/ in this sub-repo. Switch to workspace root: cd ${workspaceRoot}`
      process.stdout.write(`[flowdeck] BLOCK: ${msg}\n`)
      throw new Error(`[flowdeck] BLOCK: ${msg}`)
    }
  }

  // Guard write/edit tools — only applies to FlowDeck-initialized projects
  if (input.tool === "write" || input.tool === "edit") {
    // No .planning/ directory means FlowDeck is not initialized here — skip silently
    if (!existsSync(planningDirPath)) return

    // Check .codebase/ existence — warn if missing (proposal spec line 412)
    if (!existsSync(codebaseDirectory)) {
      process.stdout.write(`[flowdeck] WARNING: .codebase/ not found. Run /map-codebase to map the codebase.\n`)
    }

    // Check guard_enforcement override
    const effectiveSeverity = getEffectiveSeverity(configPath, statePath)
    if (effectiveSeverity === null) return

    if (effectiveSeverity === "warn") {
      const warning = getWarningMessage(statePath, planningDirPath)
      process.stdout.write(`[flowdeck] WARNING: ${warning}\n`)
      return
    }

    const blockMessage = getBlockMessage(statePath, planningDirPath)
    throw new Error(`[flowdeck] BLOCK: ${blockMessage}`)
  }

  // Guard bash build/deploy commands (proposal spec line 416)
  if (input.tool === "bash") {
    const cmd = (_output as any)?.args?.command || ""
    for (const pattern of BUILD_DEPLOY_PATTERNS) {
      if (cmd.includes(pattern)) {
        // Check if plan is confirmed before allowing build/deploy
        if (!getPlanConfirmed(statePath)) {
          const msg = "Build/deploy command detected but plan is not confirmed. Run /plan first."
          process.stdout.write(`[flowdeck] WARNING: ${msg}\n`)
          // Warning only, not a block for bash
        }
        break
      }
    }
  }
}

/**
 * Determine effective severity based on config.json override or STATE.md plan_confirmed.
 */
export function effectiveSeverity(configPath: string, statePath: string): Severity {
  if (existsSync(configPath)) {
    try {
      const configContent = readFileSync(configPath, "utf-8")
      const config = JSON.parse(configContent)
      if (config.guard_enforcement === "warn") return "warn"
      if (config.guard_enforcement === "block") return "block"
      if (config.guard_enforcement === "off") return null
    } catch { /* fall through */ }
  }
  return getPlanConfirmed(statePath) ? "block" : "warn"
}

function getEffectiveSeverity(configPath: string, statePath: string): Severity {
  return effectiveSeverity(configPath, statePath)
}

export function getPlanConfirmed(statePath: string): boolean {
  if (!existsSync(statePath)) return false
  try {
    const content = readFileSync(statePath, "utf-8")
    const match = content.match(/plan_confirmed:\s*(true|false)/i)
    return match ? match[1].toLowerCase() === "true" : false
  } catch {
    return false
  }
}

function getWarningMessage(statePath: string, planningDir: string): string {
  if (!existsSync(join(planningDir, STATE_FILE))) {
    return "No .planning/ found. Run /new-project first."
  }
  return "Plan not confirmed. Run /plan and confirm to enable execution."
}

function getBlockMessage(statePath: string, planningDir: string): string {
  if (!existsSync(join(planningDir, STATE_FILE))) {
    return "No .planning/ found. Run /new-project first."
  }
  return "Plan not confirmed. Run /plan and confirm to enable execution."
}
