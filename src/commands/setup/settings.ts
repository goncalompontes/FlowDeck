import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { planningDir, timestamp } from "../../tools/planning-state-lib"

// Agent model defaults from proposal
const DEFAULT_MODELS = {
  orchestrator: "anthropic/claude-sonnet-4-5",
  discusser: "anthropic/claude-sonnet-4-5",
  mapper: "google/gemini-2.5-flash",
  coder: "anthropic/claude-opus-4-5",
  reviewer: "google/gemini-2.5-flash",
  researcher: "openai/gpt-4o",
  tester: "anthropic/claude-haiku-4-5",
  writer: "anthropic/claude-haiku-4-5",
}

const MODEL_PROFILES = {
  quality: {
    description: "Best quality (higher cost)",
    agents: {
      orchestrator: "anthropic/claude-opus-4-5",
      discusser: "anthropic/claude-opus-4-5",
      coder: "anthropic/claude-opus-4-5",
    }
  },
  balanced: {
    description: "Balanced quality/cost",
    agents: {
      orchestrator: "anthropic/claude-sonnet-4-5",
      discusser: "anthropic/claude-sonnet-4-5",
      coder: "anthropic/claude-sonnet-4-5",
    }
  },
  budget: {
    description: "Lowest cost",
    agents: {
      orchestrator: "anthropic/claude-haiku-4-5",
      discusser: "anthropic/claude-haiku-4-5",
      coder: "anthropic/claude-haiku-4-5",
    }
  }
}

export const settingsCommand = {
  name: "fd-settings",
  description: "Interactive configurator for agent models, profiles, and workflow toggles",
  async execute(context, args?: {
    profile?: "quality" | "balanced" | "budget"
    agent?: string
    model?: string
    toggle?: string
    value?: string
    json?: boolean
  }) {
    const dir = context.directory ?? process.cwd()
    const configPath = join(dir, "opencode.json")

    // If no args, show current settings
    if (!args || (!args.profile && !args.agent && !args.toggle)) {
      return showCurrentSettings(configPath)
    }

    // Apply profile
    if (args.profile && MODEL_PROFILES[args.profile]) {
      return applyProfile(configPath, args.profile)
    }

    // Apply agent model override
    if (args.agent && args.model) {
      return setAgentModel(configPath, args.agent, args.model)
    }

    // Toggle workflow phase
    if (args.toggle) {
      return toggleWorkflowPhase(configPath, args.toggle, args.value === "true" || args.value === "on")
    }

    return {
      error: "Invalid settings command. Use --profile, --agent, or --toggle",
      code: "INVALID_ARGS"
    }
  }
}

function showCurrentSettings(configPath: any) {
  const profileExists = existsSync(configPath)
  let config: any = {}

  if (profileExists) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"))
    } catch {
      // Ignore parse errors
    }
  }

  const agents = config.agents || DEFAULT_MODELS

  const output = [
    "═".repeat(55),
    "FLOWDECK SETTINGS",
    "═".repeat(55),
    "",
    "Available profiles:",
    "  --profile quality   | Best quality (higher cost)",
    "  --profile balanced | Balanced quality/cost",
    "  --profile budget   | Lowest cost",
    "",
    "Agent model overrides:",
    "  --agent <name> --model <model>",
    "  Valid agents: orchestrator, discusser, mapper, coder, reviewer, researcher, tester, writer",
    "",
    "Workflow toggles:",
    "  --toggle <phase> --value <true|false>",
    "  Example: --toggle research --value true",
    "",
    "Current agent models:",
  ]

  for (const [agent, model] of Object.entries(agents)) {
    output.push(`  ${agent}: ${model}`)
  }

  output.push("═".repeat(55))

  return {
    success: true,
    message: output.join("\n"),
    meta: { formatted: "table", timestamp: timestamp() }
  }
}

function applyProfile(configPath: string, profile: "quality" | "balanced" | "budget") {
  const profileData = MODEL_PROFILES[profile]
  let config: any = {}

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"))
    } catch {
      config = {}
    }
  }

  // Initialize agents object
  config.agents = config.agents || {}

  // Apply profile to orchestrator, discusser, coder
  for (const [agent, model] of Object.entries(profileData.agents)) {
    config.agents[agent] = model
  }

  // Add profile metadata
  config.model_profile = profile

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")

  return {
    success: true,
    message: `Applied "${profile}" profile: ${profileData.description}`,
    profile,
    agents: profileData.agents
  }
}

function setAgentModel(configPath: string, agent: string, model: string) {
  const validAgents = Object.keys(DEFAULT_MODELS)
  if (!validAgents.includes(agent)) {
    return {
      error: `Invalid agent "${agent}". Valid: ${validAgents.join(", ")}`,
      code: "INVALID_AGENT"
    }
  }

  let config: any = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"))
    } catch {
      config = {}
    }
  }

  config.agents = config.agents || {}
  config.agents[agent] = model

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")

  return {
    success: true,
    message: `Set ${agent} model to ${model}`,
    agent,
    model
  }
}

function toggleWorkflowPhase(configPath: string, phase: string, enabled: boolean) {
  let config: any = {}

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"))
    } catch {
      config = {}
    }
  }

  config.workflow = config.workflow || {}
  config.workflow[phase] = enabled

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")

  return {
    success: true,
    message: `Workflow phase "${phase}" ${enabled ? "enabled" : "disabled"}`,
    phase,
    enabled
  }
}
