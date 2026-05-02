import type { CommandContext } from "../../types/command-context"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, resolve, basename } from "path"
import { execSync } from "child_process"
import { planningDir, timestamp } from "../../tools/planning-state-lib"

const VALID_ROLES = ["upstream-api", "downstream-consumer", "shared-lib", "gateway", "worker"] as const
type RepoRole = typeof VALID_ROLES[number]

interface MultiRepo {
  name: string
  path: string
  role: RepoRole
  tech_stack: string
  owner_team: string
  added_at: string
}

interface MultiRepoConfig {
  multi_repos: MultiRepo[]
  [key: string]: unknown
}

function configPath(dir: string): string {
  return join(planningDir(dir), "config.json")
}

function readConfig(dir: string): MultiRepoConfig {
  const cfg = configPath(dir)
  if (!existsSync(cfg)) {
    return { multi_repos: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(cfg, "utf-8"))
    if (!Array.isArray(parsed.multi_repos)) parsed.multi_repos = []
    return parsed as MultiRepoConfig
  } catch {
    return { multi_repos: [] }
  }
}

function writeConfig(dir: string, config: MultiRepoConfig): void {
  const pd = planningDir(dir)
  if (!existsSync(pd)) mkdirSync(pd, { recursive: true })
  writeFileSync(configPath(dir), JSON.stringify(config, null, 2), "utf-8")
}

function getGitBranch(repoPath: string): string {
  try {
    return execSync(`git -C "${repoPath}" branch --show-current`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim() || "—"
  } catch {
    return "—"
  }
}

function renderListTable(repos: MultiRepo[]): string {
  if (repos.length === 0) {
    return "No repos registered. Use /fd-multi-repo --add <path> <role> to add one."
  }

  const sep = "─".repeat(90)
  const header = `  ${"Name".padEnd(20)}  ${"Path".padEnd(25)}  ${"Role".padEnd(20)}  ${"Stack".padEnd(16)}  Team`
  const rows = repos.map(r =>
    `  ${r.name.padEnd(20)}  ${r.path.padEnd(25)}  ${r.role.padEnd(20)}  ${r.tech_stack.padEnd(16)}  ${r.owner_team}`
  )

  const lines = [
    "═".repeat(90),
    `Multi-Repo Registry (.planning/config.json) — ${repos.length} repo(s)`,
    sep,
    header,
    sep,
    ...rows,
    "═".repeat(90),
    `\nRun /fd-multi-repo --status to check path health.`,
  ]
  return lines.join("\n")
}

function renderStatusTable(repos: MultiRepo[], dir: string): string {
  if (repos.length === 0) {
    return "No repos registered. Use /fd-multi-repo --add <path> <role> to add one."
  }

  const sep = "─".repeat(80)
  const header = `  ${"Name".padEnd(18)}  ${"Path".padEnd(22)}  ${"Exists".padEnd(7)}  ${"Branch".padEnd(18)}  .planning/`

  const rows = repos.map(r => {
    const absPath = resolve(dir, r.path)
    const exists = existsSync(absPath)
    const branch = exists ? getGitBranch(absPath) : "—"
    const hasPlanning = exists && existsSync(planningDir(absPath))
    return `  ${r.name.padEnd(18)}  ${r.path.padEnd(22)}  ${exists ? "✅" : "❌".padEnd(6)}  ${branch.padEnd(18)}  ${hasPlanning ? "✅" : "❌"}`
  })

  const warnings: string[] = []
  for (const r of repos) {
    const absPath = resolve(dir, r.path)
    if (!existsSync(absPath)) warnings.push(`Warning: ${r.name} path does not exist on disk.`)
    else if (!existsSync(planningDir(absPath))) warnings.push(`Warning: ${r.name} has no .planning/ — cross-repo planning context unavailable.`)
  }

  const lines = [
    "═".repeat(80),
    "Multi-Repo Status",
    sep,
    header,
    sep,
    ...rows,
    "═".repeat(80),
    ...(warnings.length > 0 ? ["", ...warnings] : []),
  ]
  return lines.join("\n")
}

export const multiRepoCommand = {
  name: "fd-multi-repo",
  description: "Manage multi-repo registry in .planning/config.json — add, list, status, remove repos",
  async execute(
    context: CommandContext,
    args?: {
      add?: string
      role?: string
      name?: string
      tech_stack?: string
      owner_team?: string
      list?: boolean
      status?: boolean
      remove?: string
      json?: boolean
    }
  ) {
    const dir = context.directory ?? process.cwd()

    // --add <path> <role>
    if (args?.add) {
      const repoPath = args.add
      const role = args.role as RepoRole | undefined

      if (!role || !VALID_ROLES.includes(role as RepoRole)) {
        return {
          error: `Role is required and must be one of: ${VALID_ROLES.join(", ")}`,
          code: "INVALID_ROLE",
          hint: `Usage: /fd-multi-repo --add <path> --role <role>`,
        }
      }

      const name = args.name || basename(resolve(dir, repoPath))
      const config = readConfig(dir)

      if (config.multi_repos.some(r => r.name === name || r.path === repoPath)) {
        return {
          error: `Repo '${name}' (or path '${repoPath}') is already registered.`,
          code: "ALREADY_EXISTS",
        }
      }

      const entry: MultiRepo = {
        name,
        path: repoPath,
        role: role as RepoRole,
        tech_stack: args.tech_stack ?? "",
        owner_team: args.owner_team ?? "",
        added_at: timestamp(),
      }

      config.multi_repos.push(entry)
      writeConfig(dir, config)

      return {
        success: true,
        message: `Registered '${name}' (${role}) at ${repoPath}.\nRun /fd-multi-repo --status to verify path health.`,
        data: entry,
      }
    }

    // --remove <name>
    if (args?.remove) {
      const config = readConfig(dir)
      const before = config.multi_repos.length
      config.multi_repos = config.multi_repos.filter(r => r.name !== args.remove)

      if (config.multi_repos.length === before) {
        return {
          error: `Repo '${args.remove}' not found in registry.`,
          code: "NOT_FOUND",
          hint: `Run /fd-multi-repo --list to see registered repos.`,
        }
      }

      writeConfig(dir, config)
      return {
        success: true,
        message: `Removed '${args.remove}' from registry. Files on disk are unchanged.`,
      }
    }

    // --status
    if (args?.status) {
      const config = readConfig(dir)
      if (args.json) return { success: true, data: config.multi_repos }
      return { success: true, message: renderStatusTable(config.multi_repos, dir) }
    }

    // default / --list
    const config = readConfig(dir)
    if (args?.json) return { success: true, data: config.multi_repos }
    return { success: true, message: renderListTable(config.multi_repos) }
  },
}
