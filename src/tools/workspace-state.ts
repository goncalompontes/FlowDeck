import { tool } from "@opencode-ai/plugin"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join, dirname, resolve } from "path"
import { findWorkspaceRoot, resolveSubRepos, getWorkspaceConfig, planningDir, statePath, timestamp } from "./planning-state-lib"

type WorkspaceMode = "shared" | "per-repo"

interface SubRepo {
  name: string
  path: string
  status: "active" | "not_initialized" | "not_found"
}

function getRepoName(repoPath: string): string {
  return repoPath.split(/[/\\]/).pop() || repoPath
}

function readWorkspaceStateFile(workspaceRoot: string): string | null {
  const sp = join(planningDir(workspaceRoot), "STATE.md")
  if (!existsSync(sp)) return null
  return readFileSync(sp, "utf-8")
}

function writeWorkspaceStateFile(workspaceRoot: string, content: string): void {
  const sp = join(planningDir(workspaceRoot), "STATE.md")
  writeFileSync(sp, content, "utf-8")
}

function parseWorkspaceState(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = content.split("\n")
  for (const line of lines) {
    const kvMatch = line.match(/^\*\*([^:]+):\*\*\s*(.+)/)
    if (kvMatch) {
      result[kvMatch[1].trim()] = kvMatch[2].trim()
    }
  }
  return result
}

async function readWorkspaceContextAction(dir: string, mode: WorkspaceMode, workspaceRoot: string) {
  const stateContent = readWorkspaceStateFile(workspaceRoot)
  if (!stateContent) {
    return { error: "Workspace STATE.md not found. Initialize workspace first." }
  }
  const parsed = parseWorkspaceState(stateContent)
  return { exists: true, workspace_root: workspaceRoot, workspace_mode: mode, ...parsed }
}

async function updateWorkspaceContextAction(dir: string, mode: WorkspaceMode, workspaceRoot: string, updates: { current_repo?: string, status?: string, phase?: number } | undefined) {
  if (!updates) return { error: "No updates provided" }
  let content = readWorkspaceStateFile(workspaceRoot)
  if (!content) {
    content = "# Workspace State\n\n---\n\n"
  }
  if (updates.current_repo !== undefined) {
    const regex = /^\*\*current_repo:\*\*.*/m
    if (regex.test(content)) {
      content = content.replace(regex, `**current_repo:** ${updates.current_repo}`)
    } else {
      content = content.replace(/^---\n/, `---\n\n**current_repo:** ${updates.current_repo}\n`)
    }
  }
  if (updates.status !== undefined) {
    const regex = /^\*\*status:\*\*.*/m
    if (regex.test(content)) {
      content = content.replace(regex, `**status:** ${updates.status}`)
    }
  }
  writeWorkspaceStateFile(workspaceRoot, content)
  return { success: true, updated_at: timestamp() }
}

async function listSubReposAction(dir: string, subRepos: string[], workspaceRoot: string): Promise<{ repos: SubRepo[] }> {
  const resolved = resolveSubRepos(join(workspaceRoot, ".planning", "config.json"), subRepos)
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
  return { repos }
}

async function getSubRepoStateAction(dir: string, repoName: string | undefined, subRepos: string[], workspaceRoot: string, mode: WorkspaceMode) {
  if (!repoName) return { error: "repo name is required" }
  const resolved = resolveSubRepos(join(workspaceRoot, ".planning", "config.json"), subRepos)
  const targetPath = resolved.find(p => getRepoName(p) === repoName)
  if (!targetPath) {
    return { error: "not_found", path: repoName, message: `Repo '${repoName}' not found in sub_repos` }
  }
  const planningPath = planningDir(targetPath)
  if (!existsSync(planningPath)) {
    return { error: "not_found", path: targetPath }
  }
  const sp = statePath(targetPath)
  if (!existsSync(sp)) {
    return { error: "not_found", path: targetPath, message: `.planning/STATE.md not found in ${repoName}` }
  }
  const stateContent = readFileSync(sp, "utf-8")
  const parsed = parseWorkspaceState(stateContent)
  return {
    repo_path: targetPath,
    repo_name: repoName,
    ...parsed,
  }
}

export const workspaceStateTool = tool({
  description: "Manage workspace state across multiple repos: read workspace context, update context, list sub-repos, get sub-repo state",
  args: {
    action: tool.schema.enum(["read_context", "update_context", "list_repos", "get_repo_state"]),
    updates: tool.schema.object({
      current_repo: tool.schema.string().optional(),
      status: tool.schema.string().optional(),
      phase: tool.schema.number().optional(),
    }).optional(),
    repo: tool.schema.string().optional(),
  },
  async execute(args, context): Promise<string> {
    const dir = context.directory ?? process.cwd()
    const workspaceRoot = findWorkspaceRoot(dir)
    if (!workspaceRoot) {
      return JSON.stringify({ error: "Workspace root not found. No config.json with sub_repos found." })
    }
    const config = getWorkspaceConfig(dir)
    if (!config) {
      return JSON.stringify({ error: "Could not read workspace config." })
    }
    const mode: WorkspaceMode = config.workspace_mode
    const subRepos: string[] = config.sub_repos || []

    switch (args.action) {
      case "read_context":
        return JSON.stringify(await readWorkspaceContextAction(dir, mode, workspaceRoot))
      case "update_context":
        return JSON.stringify(await updateWorkspaceContextAction(dir, mode, workspaceRoot, args.updates))
      case "list_repos":
        return JSON.stringify(await listSubReposAction(dir, subRepos, workspaceRoot))
      case "get_repo_state":
        return JSON.stringify(await getSubRepoStateAction(dir, args.repo, subRepos, workspaceRoot, mode))
    }
  },
})