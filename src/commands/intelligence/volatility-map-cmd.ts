import { existsSync } from "fs"
import { join } from "path"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"

export const volatilityMapCommand = {
  name: "fd-volatility-map",
  description: "Codebase Volatility Map — highlight unstable zones based on git churn, hotfix frequency, and unresolved TODO clusters. Updates .codebase/VOLATILITY.json.",
  async execute(context, args?: { threshold?: "stable" | "moderate" | "volatile" | "critical"; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    const threshold = args?.threshold ?? "volatile"
    const state = readPlanningState(dir)
    const cd = codebaseDir(dir)

    const existingPath = join(cd, "VOLATILITY.json")
    const hasExisting = existsSync(existingPath)

    const config = {
      threshold,
      agents: [
        { name: "researcher", role: "run git log --follow to count commits per file (last 90 days)" },
        { name: "researcher", role: "scan TODO/FIXME/HACK/XXX comments per file" },
        { name: "researcher", role: "find commits with 'hotfix', 'revert', 'urgent' in message" },
      ],
      output_tool: "volatility-map",
      output_action: "write",
      output_file: ".codebase/VOLATILITY.json",
      has_existing_data: hasExisting,
      workflow: "volatility-map-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(60),
      "Codebase Volatility Map",
      "─".repeat(60),
      `  Threshold: ${threshold}+ zones`,
      `  Existing data: ${hasExisting ? "yes (will update)" : "no (first run)"}`,
      "─".repeat(60),
      "  researcher → git churn analysis (90 days)",
      "  researcher → TODO/FIXME/HACK cluster scan",
      "  researcher → hotfix/revert commit detection",
      "─".repeat(60),
      "  Output: .codebase/VOLATILITY.json + summary of hotspots",
      "═".repeat(60),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
