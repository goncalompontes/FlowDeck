import type { Plugin, PluginModule } from "@opencode-ai/plugin"

import { planningStateTool } from "./tools/planning-state"
import { codebaseStateTool } from "./tools/codebase-state"
import { workspaceStateTool } from "./tools/workspace-state"
import { runParallelTool } from "./tools/run-parallel"
import { runPipelineTool } from "./tools/run-pipeline"
import { delegateTool } from "./tools/delegate"
import { repoMemoryTool } from "./tools/repo-memory"
import { failureReplayTool } from "./tools/failure-replay"
import { decisionTraceTool } from "./tools/decision-trace"
import { volatilityMapTool } from "./tools/volatility-map"
import { policyEngineTool } from "./tools/policy-engine"

import { guardRailsHook } from "./hooks/guard-rails"
import { toolGuardHook } from "./hooks/tool-guard"
import { sessionStartHook } from "./hooks/session-start"
import { notifyCommandInteraction } from "./hooks/notifications"
import { patchTrustHook } from "./hooks/patch-trust"
import { decisionTraceHook } from "./hooks/decision-trace-hook"

import { newProjectCommand } from "./commands/setup/new-project"
import { mapCodebaseCommand } from "./commands/setup/map-codebase"
import { settingsCommand } from "./commands/setup/settings"
import { discussCommand } from "./commands/planning/discuss"
import { planCommand } from "./commands/planning/plan"
import { roadmapCommand } from "./commands/planning/roadmap"
import { dashboardCommand } from "./commands/planning/dashboard"
import { askCommand } from "./commands/planning/ask"
import { newFeatureCommand } from "./commands/execution/new-feature"
import { fixBugCommand } from "./commands/execution/fix-bug"
import { reviewCodeCommand } from "./commands/execution/review-code"
import { writeDocsCommand } from "./commands/execution/write-docs"
import { deployCheckCommand } from "./commands/execution/deploy-check"
import { progressCommand } from "./commands/state/progress"
import { resumeCommand } from "./commands/state/resume"
import { checkpointCommand } from "./commands/state/checkpoint"
import { workspaceCommands } from "./commands/state/workspace-commands"
import { impactRadarCommand } from "./commands/intelligence/impact-radar"
import { blastRadiusCommand } from "./commands/intelligence/blast-radius"
import { translateIntentCommand } from "./commands/intelligence/translate-intent"
import { volatilityMapCommand } from "./commands/intelligence/volatility-map-cmd"
import { regressionPredictCommand } from "./commands/intelligence/regression-predict"
import { testGapCommand } from "./commands/intelligence/test-gap"
import { reviewRouteCommand } from "./commands/intelligence/review-route"
import { analyzeChangeCommand } from "./commands/analysis/analyze-change"
import { guardedEditCommand } from "./commands/analysis/guarded-edit"
import { evaluateRiskCommand } from "./commands/analysis/evaluate-risk"

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs || rawArgs.trim() === "") return {}
  try {
    return JSON.parse(rawArgs)
  } catch {
    return { input: rawArgs }
  }
}

const server: Plugin = async (input, _options) => {
  const { directory } = input

  const allCommands = [
    newProjectCommand,
    mapCodebaseCommand,
    settingsCommand,
    discussCommand,
    planCommand,
    roadmapCommand,
    dashboardCommand,
    askCommand,
    newFeatureCommand,
    fixBugCommand,
    reviewCodeCommand,
    writeDocsCommand,
    deployCheckCommand,
    progressCommand,
    resumeCommand,
    checkpointCommand,
    ...workspaceCommands,
    impactRadarCommand,
    blastRadiusCommand,
    translateIntentCommand,
    volatilityMapCommand,
    regressionPredictCommand,
    testGapCommand,
    reviewRouteCommand,
    // ── umbrella analysis commands ──────────────────────────────────────
    analyzeChangeCommand,
    guardedEditCommand,
    evaluateRiskCommand,
  ]

  const commandMap: Record<string, { execute(context: any, args?: any): Promise<any> }> = {}
  for (const cmd of allCommands) {
    commandMap[cmd.name] = cmd
  }

  return {
    tool: {
      "planning-state": planningStateTool,
      "codebase-state": codebaseStateTool,
      "workspace-state": workspaceStateTool,
      "run-parallel": runParallelTool,
      "run-pipeline": runPipelineTool,
      "delegate": delegateTool,
      "repo-memory": repoMemoryTool,
      "failure-replay": failureReplayTool,
      "decision-trace": decisionTraceTool,
      "volatility-map": volatilityMapTool,
      "policy-engine": policyEngineTool,
    },

    event: async ({ event }: { event: any }) => {
      const type: string = event?.type ?? ""
      if (type === "session.created" || type === "session.started") {
        await sessionStartHook({ directory })
      }
    },

    "command.execute.before": async (cmdInput: any, output: any) => {
      const handler = commandMap[cmdInput.command]
      if (!handler) return
      try {
        const args = parseArgs(cmdInput.arguments)
        const result = await handler.execute({ directory }, args)
        const text = typeof result === "string"
          ? result
          : JSON.stringify(result, null, 2)
        output.parts.push({ type: "text", text })
        // Fire desktop notification after command result is ready (best-effort)
        notifyCommandInteraction(cmdInput.command)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        output.parts.push({ type: "text", text: `FlowDeck error: ${msg}` })
      }
    },

    "tool.execute.before": async (toolInput: any, toolOutput: any) => {
      await guardRailsHook({ directory }, toolInput, toolOutput)
      await toolGuardHook({ directory }, toolInput, toolOutput)
      await patchTrustHook({ directory }, toolInput, toolOutput)
      await decisionTraceHook({ directory }, toolInput, toolOutput)
    },
  }
}

const plugin: PluginModule = {
  id: "opencode-flowdeck",
  server,
}

export default plugin
