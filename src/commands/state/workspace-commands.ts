import { tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join, resolve } from "path"
import { findWorkspaceRoot, resolveSubRepos, getWorkspaceConfig, planningDir, statePath, timestamp } from "../../tools/planning-state-lib"

type WorkspaceMode = "shared" | "per-repo"

interface SubRepo {
  name: string
  path: string
  status: "active" | "not_initialized" | "not_found"
}

function getRepoName(repoPath: string): string {
  return repoPath.split(/[/\\]/).pop() || repoPath
}

function parseWorkspaceState(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const line of content.split("\n")) {
    const kvMatch = line.match(/^\*\*([^:]+):\*\*\s*(.+)/)
    if (kvMatch) {
      result[kvMatch[1].trim()] = kvMatch[2].trim()
    }
  }
  return result
}

function readRepoState(repoPath: string): Record<string, unknown> | null {
  const sp = statePath(repoPath)
  if (!existsSync(sp)) return null
  const content = readFileSync(sp, "utf-8")
  return parseWorkspaceState(content)
}

async function listSubRepos(dir: string, subRepos: string[], workspaceRoot: string): Promise<SubRepo[]> {
  const configPath = join(workspaceRoot, ".planning", "config.json")
  const resolved = resolveSubRepos(configPath, subRepos)
  const repos: SubRepo[] = []
  for (const repoPath of resolved) {
    const repoName = getRepoName(repoPath)
    const planningPath = planningDir(repoPath)
    const hasPlanning = existsSync(planningPath)
    repos.push({
      name: repoName,
      path: repoPath,
      status: hasPlanning ? "active" : "not_initialized",
    })
  }
  return repos
}

function renderStatusTable(repos: SubRepo[], repoStates: Record<string, Record<string, unknown>>): string[] {
  const lines: string[] = []
  lines.push("═".repeat(60))
  lines.push("Workspace Status")
  lines.push("─".repeat(60))

  const header = "  Repo                  | Phase    | Status      | Progress"
  lines.push(header)
  lines.push("─".repeat(60))

  for (const repo of repos) {
    const state = repoStates[repo.name]
    const repoName = repo.name.padEnd(20)
    let phase = "—".padEnd(8)
    let status = repo.status.padEnd(10)
    let progress = "N/A".padEnd(15)

    if (repo.status === "active" && state) {
      if (state.phase) phase = String(state.phase).padEnd(8)
      if (state.status) status = String(state.status).padEnd(10)
      if (state.progress) {
        const p = state.progress as Record<string, unknown>
        const percent = p.percent as number | undefined
        if (percent !== undefined) {
          progress = `${percent}%`.padEnd(15)
        }
      }
    }

    lines.push(`  ${repoName} | ${phase} | ${status} | ${progress}`)
  }

  lines.push("═".repeat(60))

  const notInitialized = repos.filter(r => r.status === "not_initialized")
  if (notInitialized.length > 0) {
    lines.push("")
    lines.push(`⚠ ${notInitialized.length} repo(s) not initialized: ${notInitialized.map(r => r.name).join(", ")}`)
    lines.push("Run /workspace add to add repos, or /workspace sync to sync state.")
  }

  return lines
}

export const statusCommand = {
  name: "workspace status",
  description: "Display workspace overview: all repos, their current phase, status, and progress",
  async execute(context, args?: { json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const workspaceRoot = findWorkspaceRoot(dir)

    if (!workspaceRoot) {
      return { error: "Workspace root not found. No config.json with sub_repos found." }
    }

    const config = getWorkspaceConfig(dir)
    if (!config) {
      return { error: "Could not read workspace config." }
    }

    const subRepos: string[] = config.sub_repos || []
    if (subRepos.length === 0) {
      return {
        success: true,
        message: "No sub-repos configured. Add repos with /workspace add <path> or configure sub_repos in config.json.",
      }
    }

    const repos = await listSubRepos(dir, subRepos, workspaceRoot)
    const repoStates: Record<string, Record<string, unknown>> = {}

    for (const repo of repos) {
      if (repo.status === "active") {
        repoStates[repo.name] = readRepoState(repo.path) || {}
      }
    }

    const tableLines = renderStatusTable(repos, repoStates)

    return {
      success: true,
      message: tableLines.join("\n"),
      data: {
        workspace_root: workspaceRoot,
        workspace_mode: config.workspace_mode,
        repos: repos.map(r => ({ name: r.name, status: r.status, state: repoStates[r.name] || null })),
      },
    }
  },
}

export const syncCommand = {
  name: "workspace sync",
  description: "Sync workspace root STATE.md with all sub-repo states (shared mode)",
  async execute(context) {
    const dir = context.directory ?? process.cwd()
    const workspaceRoot = findWorkspaceRoot(dir)

    if (!workspaceRoot) {
      return { error: "No workspace found. Ensure config.json has sub_repos configured." }
    }

    const config = getWorkspaceConfig(dir)
    if (!config) {
      return { error: "Could not read workspace config." }
    }

    if (config.workspace_mode === "per-repo") {
      return {
        success: true,
        message: "Sync not needed in per-repo mode. Each repo manages its own .planning/.",
      }
    }

    // Shared mode: aggregate STATE.md entries from all active repos
    const subRepos: string[] = config.sub_repos || []
    const repos = await listSubRepos(dir, subRepos, workspaceRoot)
    const activeRepos = repos.filter(r => r.status === "active")

    if (activeRepos.length === 0) {
      return {
        success: true,
        message: "No active repos to sync.",
      }
    }

    const tableLines: string[] = ["═".repeat(60), "Workspace Sync Results", "─".repeat(60)]
    let syncCount = 0

    for (const repo of activeRepos) {
      const state = readRepoState(repo.path)
      if (state) {
        syncCount++
        const phase = state.phase ? String(state.phase) : "—"
        const status = state.status ? String(state.status) : "unknown"
        tableLines.push(`  ${repo.name.padEnd(22)} | Phase ${phase.padEnd(4)} | ${status}`)
      }
    }

    // Update workspace root STATE.md with aggregated entries
    let workspaceStateContent = ""
    const workspaceStatePath = statePath(workspaceRoot)
    if (existsSync(workspaceStatePath)) {
      workspaceStateContent = readFileSync(workspaceStatePath, "utf-8")
    } else {
      workspaceStateContent = "---\n\n## Sub-Repo Status\n"
    }

    // Add aggregated section
    const repoEntries = activeRepos.map(r => {
      const s = readRepoState(r.path)
      return `**${r.name}:** Phase ${s?.phase ?? "?"} | ${s?.status ?? "?"} | Updated ${timestamp()}`
    }).join("\n")

    if (workspaceStateContent.includes("## Sub-Repo Status")) {
      workspaceStateContent = workspaceStateContent.replace(/## Sub-Repo Status\n[\s\S]*/, `## Sub-Repo Status\n${repoEntries}\n`)
    } else {
      workspaceStateContent += `\n## Sub-Repo Status\n${repoEntries}\n`
    }

    writeFileSync(workspaceStatePath, workspaceStateContent, "utf-8")

    tableLines.push("═".repeat(60))
    tableLines.push(`Sync complete. ${syncCount}/${activeRepos.length} repos synchronized.`)
    tableLines.push(`Workspace STATE.md updated at: ${workspaceRoot}`)

    return {
      success: true,
      message: tableLines.join("\n"),
    }
  },
}

export const switchCommand = {
  name: "workspace switch",
  description: "Switch current active repo in workspace context",
  async execute(context, args?: { repo?: string }) {
    const dir = context.directory ?? process.cwd()

    if (!args?.repo) {
      return { error: "Repo name required. Usage: /workspace switch [repo]" }
    }

    const workspaceRoot = findWorkspaceRoot(dir)
    if (!workspaceRoot) {
      return { error: "No workspace found. Ensure config.json has sub_repos configured." }
    }

    const config = getWorkspaceConfig(dir)
    if (!config) {
      return { error: "Could not read workspace config." }
    }

    const subRepos: string[] = config.sub_repos || []
    const resolved = resolveSubRepos(join(workspaceRoot, ".planning", "config.json"), subRepos)
    const targetPath = resolved.find(p => getRepoName(p) === args.repo)

    if (!targetPath) {
      return { error: `Repo '${args.repo}' not found in workspace sub_repos.` }
    }

    // Update workspace STATE.md with current_repo
    const workspaceStatePath = statePath(workspaceRoot)
    let content = existsSync(workspaceStatePath) ? readFileSync(workspaceStatePath, "utf-8") : "---\n\n"
    const currentRepoLine = `**current_repo:** ${args.repo}`

    if (content.includes("**current_repo:**")) {
      content = content.replace(/\*\*current_repo:\*\*.*/m, currentRepoLine)
    } else {
      content = content.replace(/^---\n/, `---\n\n${currentRepoLine}\n`)
    }
    writeFileSync(workspaceStatePath, content, "utf-8")

    return {
      success: true,
      message: `Switched to repo '${args.repo}'. Subsequent commands will target this repo.`,
    }
  },
}

export const addCommand = {
  name: "workspace add",
  description: "Add a repository path to workspace sub_repos",
  async execute(context, args?: { path?: string }) {
    const dir = context.directory ?? process.cwd()

    if (!args?.path) {
      return { error: "Path required. Usage: /workspace add [path]" }
    }

    const workspaceRoot = findWorkspaceRoot(dir)
    if (!workspaceRoot) {
      return { error: "No workspace found. Ensure config.json has sub_repos configured." }
    }

    // Resolve the path (absolute or relative to current directory)
    const resolvedPath = resolve(dir, args.path)
    const planningPath = planningDir(resolvedPath)

    // Validate .planning/ exists at that path
    if (!existsSync(planningPath)) {
      return { error: "Path does not have a .planning/ directory. Run /new-project in that repo first." }
    }

    const configPath = join(workspaceRoot, ".planning", "config.json")
    let configContent = readFileSync(configPath, "utf-8")
    let config = JSON.parse(configContent)

    // Initialize sub_repos array if needed
    if (!config.sub_repos) {
      config.sub_repos = []
    }

    // Add path if not already present (deduplicate)
    if (!config.sub_repos.includes(args.path)) {
      config.sub_repos.push(args.path)
      configContent = JSON.stringify(config, null, 2)
      writeFileSync(configPath, configContent, "utf-8")
    }

    return {
      success: true,
      message: `Added '${args.path}' to workspace. Run /workspace sync to include it in workspace state.`,
    }
  },
}

export const removeCommand = {
  name: "workspace remove",
  description: "Remove a repository from workspace sub_repos (by repo name, not path)",
  async execute(context, args?: { repo?: string }) {
    const dir = context.directory ?? process.cwd()

    if (!args?.repo) {
      return { error: "Repo name required. Usage: /workspace remove [repo]" }
    }

    const workspaceRoot = findWorkspaceRoot(dir)
    if (!workspaceRoot) {
      return { error: "No workspace found. Ensure config.json has sub_repos configured." }
    }

    const configPath = join(workspaceRoot, ".planning", "config.json")
    const configContent = readFileSync(configPath, "utf-8")
    const config = JSON.parse(configContent)

    if (!config.sub_repos || !Array.isArray(config.sub_repos)) {
      return { error: `Repo '${args.repo}' not found in workspace sub_repos.` }
    }

    const resolved = resolveSubRepos(configPath, config.sub_repos)
    const targetPath = resolved.find(p => getRepoName(p) === args.repo)

    if (!targetPath) {
      return { error: `Repo '${args.repo}' not found in workspace sub_repos.` }
    }

    // Remove from sub_repos array (by original path, not resolved)
    const originalPath = config.sub_repos.find(p => {
      const resolvedP = resolve(workspaceRoot, p)
      return resolvedP === targetPath || getRepoName(resolvedP) === args.repo
    })

    if (originalPath) {
      config.sub_repos = config.sub_repos.filter(p => p !== originalPath)
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
    }

    return {
      success: true,
      message: `Removed '${args.repo}' from workspace. Files unchanged.`,
    }
  },
}

export const defaultCommand = {
  name: "workspace",
  description: "Workspace management commands (status, sync, switch, add, remove)",
  async execute(context, args?: { subcommand?: string }) {
    return statusCommand.execute(context, args)
  },
}

export const workspaceCommands = [
  statusCommand,
  syncCommand,
  switchCommand,
  addCommand,
  removeCommand,
  defaultCommand,
]