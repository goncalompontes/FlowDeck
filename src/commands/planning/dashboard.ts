import type { CommandContext } from "../../types/command-context"
import { spawn } from "child_process"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { findOpenPort } from "../../dashboard/lib/port-finder"

// Resolves to dist/dashboard/server.mjs regardless of where the package is installed
const SERVER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "dashboard", "server.mjs")

export const dashboardCommand = {
  name: "fd-dashboard",
  description: "Open project dashboard in browser — displays phase progress, milestones, and blockers",
  async execute(context: CommandContext, args?: { refresh?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const dashboardDir = path.join(dir, ".dashboard")

    // Handle refresh mode
    if (args?.refresh) {
      const portFile = path.join(dashboardDir, "port")
      if (!existsSync(portFile)) {
        return { success: false, error: "No dashboard server running. Run /dashboard first.", code: "NO_SERVER" }
      }
      const port = readFileSync(portFile, "utf-8").trim()
      try {
        const resp = await fetch(`http://localhost:${port}/refresh`)
        if (resp.ok) {
          return { success: true, message: `Dashboard refreshed at http://localhost:${port}` }
        }
      } catch {
        return { success: false, error: `Could not reach dashboard at port ${port}`, code: "REFRESH_FAILED" }
      }
    }

    // Find open port
    const { port } = await findOpenPort(3456, 100)

    // Spawn detached server
    const child = spawn("bun", [SERVER_PATH, `--port=${port}`, `--dir=${dir}`], {
      detached: true,
      stdio: "ignore",
    })
    child.unref()

    // Wait briefly for server to start
    await new Promise(r => setTimeout(r, 500))

    const url = `http://localhost:${port}`
    return {
      success: true,
      message: `Dashboard running at ${url} — opening browser`,
      meta: { port, url }
    }
  }
}