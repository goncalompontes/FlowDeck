import type { CommandContext } from "../../types/command-context"
import { timestamp } from "../../tools/planning-state-lib"
import { runImpactRadar } from "../../lib/impact-radar"
import { existsSync } from "fs"
import { join } from "path"

interface RouteRule {
  keywords: string[]
  agent: string
  focus: string
  description: string
  useImpactRadar?: boolean
}

const ROUTES: RouteRule[] = [
  {
    keywords: ["system design", "design", "architecture", "diagram", "structure", "component", "microservice", "schema design"],
    agent: "architect",
    focus: "system design and architecture",
    description: "Design systems, components, and architecture",
  },
  {
    keywords: ["impact", "blast radius", "affected", "downstream", "dependency", "ripple", "change radar"],
    agent: "researcher",
    focus: "change impact and dependency analysis",
    description: "Assess impact and downstream effects of a change",
    useImpactRadar: true,
  },
  {
    keywords: ["security", "vulnerability", "cve", "exploit", "injection", "xss", "csrf", "auth bypass", "pentest", "audit", "owasp"],
    agent: "security-auditor",
    focus: "security analysis",
    description: "Security audit, vulnerability assessment, threat analysis",
  },
  {
    keywords: ["performance", "bottleneck", "slow", "latency", "optimize", "benchmark", "profil", "memory leak", "cpu", "throughput"],
    agent: "performance-optimizer",
    focus: "performance analysis and optimization",
    description: "Profile, benchmark, and optimize performance",
  },
  {
    keywords: ["debug", "error", "exception", "crash", "panic", "traceback", "stack trace", "not working", "broken", "bug"],
    agent: "debug-specialist",
    focus: "root cause investigation",
    description: "Investigate errors, crashes, and unexpected behavior",
  },
  {
    keywords: ["test", "coverage", "spec", "unit test", "integration test", "mock", "fixture", "tdd", "assert"],
    agent: "tester",
    focus: "test generation and coverage",
    description: "Write tests, improve coverage, and validate behavior",
  },
  {
    keywords: ["refactor", "cleanup", "simplify", "extract", "rename", "reorganize", "decouple", "dry", "dead code"],
    agent: "coder",
    focus: "refactoring and code quality",
    description: "Refactor and improve code without changing behavior",
  },
  {
    keywords: ["document", "docs", "readme", "wiki", "jsdoc", "docstring", "comment", "explain to", "write up"],
    agent: "writer",
    focus: "documentation generation",
    description: "Write or update documentation",
  },
  {
    keywords: ["explain", "how does", "what does", "what is", "understand", "query", "search", "find", "where", "explore", "trace"],
    agent: "code-explorer",
    focus: "code exploration and explanation",
    description: "Explore and explain code, find patterns, trace flows",
  },
  {
    keywords: ["deploy", "release", "production", "rollback", "migration", "upgrade", "version"],
    agent: "reviewer",
    focus: "deployment readiness",
    description: "Review for deployment readiness and risk",
  },
  {
    keywords: ["plan", "roadmap", "breakdown", "estimate", "milestone", "task", "phase", "sprint"],
    agent: "planner",
    focus: "planning and task breakdown",
    description: "Create plans, roadmaps, and task breakdowns",
  },
]

function scoreRoute(task: string, rule: RouteRule): number {
  const lower = task.toLowerCase()
  let score = 0
  for (const kw of rule.keywords) {
    if (lower.includes(kw.toLowerCase())) {
      // longer keyword matches score higher
      score += kw.split(" ").length
    }
  }
  return score
}

function pickRoute(task: string): RouteRule & { score: number } {
  let best: (RouteRule & { score: number }) | null = null
  for (const rule of ROUTES) {
    const score = scoreRoute(task, rule)
    if (score > 0 && (!best || score > best.score)) {
      best = { ...rule, score }
    }
  }
  return best ?? { ...ROUTES[ROUTES.length - 1], agent: "orchestrator", focus: "general task", description: "General purpose task", score: 0 }
}

export const askCommand = {
  name: "fd-ask",
  description: "Smart dispatch — routes a free-form task to the appropriate specialized agent without a workflow",
  async execute(context: CommandContext, args?: { task?: string; agent?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()

    if (!args?.task && !args?.agent) {
      return {
        error: "Provide a task description: /fd-ask --task 'system design for notifications'",
        code: "NO_TASK",
        hint: "Examples: 'explain how auth works', 'security audit of payments', 'design a caching layer'",
        examples: ROUTES.slice(0, 5).map(r => ({ agent: `@${r.agent}`, example: r.keywords[0] })),
      }
    }

    const task = args?.task ?? ""
    const route = args?.agent
      ? ({ agent: args.agent, focus: "user-specified", description: "Manually specified agent", score: -1, keywords: [], useImpactRadar: false }) as RouteRule & { score: number }
      : pickRoute(task)

    const radar = route.useImpactRadar ? runImpactRadar(dir, task) : null

    const dispatch = {
      agent: `@${route.agent}`,
      task,
      focus: route.focus,
      routed_by: args?.agent ? "user-override" : "keyword-match",
      impact_radar: radar ?? undefined,
    }

    if (args?.json) {
      return {
        success: true,
        data: dispatch,
        meta: { formatted: "json", timestamp: timestamp() }
      }
    }

    const lines = [
      "─".repeat(55),
      `  /fd-ask → routing to ${dispatch.agent}`,
      `  Task:  ${task}`,
      `  Focus: ${route.focus}`,
    ]

    if (radar?.risk_flag) {
      lines.push("─".repeat(55))
      lines.push("  ⚠ Impact Radar:")
      if (radar.hotspots.length > 0) {
        lines.push(`  Volatile zones: ${radar.hotspots.map(h => h.path).join(", ")}`)
      }
      if (radar.known_failures.length > 0) {
        lines.push(`  Known failures: ${radar.known_failures.map(f => f.id).join(", ")}`)
      }
    }

    lines.push("═".repeat(55))

    return {
      success: true,
      message: lines.join("\n"),
      dispatch,
      meta: { formatted: "table", timestamp: timestamp() }
    }
  }
}
