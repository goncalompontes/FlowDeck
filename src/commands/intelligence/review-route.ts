import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { statePath, codebaseDir, timestamp, readPlanningState } from "../../tools/planning-state-lib"
import { scorePatch, type TrustVerdict } from "../../hooks/patch-trust"

const REVIEWER_TYPES = ["security", "backend", "infra", "domain-owner", "frontend", "data", "devops"] as const
type ReviewerType = typeof REVIEWER_TYPES[number]

const ROUTING_KEYWORDS: Record<ReviewerType, string[]> = {
  security: ["auth", "token", "password", "crypto", "secret", "jwt", "permission", "rbac", "xss", "sql"],
  backend: ["api", "route", "controller", "service", "database", "query", "migration"],
  infra: ["docker", "kubernetes", "terraform", "ci", "cd", "deploy", "helm", "nginx", "aws", "gcp"],
  "domain-owner": ["business", "billing", "payment", "checkout", "order", "subscription", "pricing"],
  frontend: ["component", "css", "html", "react", "vue", "angular", "ui", "ux", "style"],
  data: ["schema", "migration", "model", "index", "constraint", "foreign key", "partition"],
  devops: ["pipeline", "workflow", ".yml", ".yaml", "action", "cron", "schedule", "artifact"],
}

function routeReview(filePaths: string[], trustVerdict: TrustVerdict): ReviewerType[] {
  const routes = new Set<ReviewerType>()
  const combined = filePaths.join(" ").toLowerCase()
  for (const [type, keywords] of Object.entries(ROUTING_KEYWORDS) as [ReviewerType, string[]][]) {
    if (keywords.some(kw => combined.includes(kw))) routes.add(type)
  }
  // High-risk always gets security reviewer
  if (trustVerdict === "high-risk") routes.add("security")
  return Array.from(routes)
}

export const reviewRouteCommand = {
  name: "fd-review-route",
  description: "Human Review Routing — route risky patches to the right reviewer type (security, backend, infra, domain-owner) based on change nature and patch trust score",
  async execute(context, args?: { files?: string; change?: string; json?: boolean }) {
    const dir = context.directory ?? process.cwd()
    const sp = statePath(dir)

    if (!existsSync(sp)) {
      return { error: "STATE.md not found. Run /new-project first.", code: "NOT_INITIALIZED" }
    }

    const files = args?.files ? args.files.split(",").map(s => s.trim()) : []
    const change = args?.change || ""
    const state = readPlanningState(dir)

    // Score the first affected file for trust
    let trustVerdict: TrustVerdict = "safe"
    if (files.length > 0) {
      const ts = scorePatch(dir, files[0])
      trustVerdict = ts.verdict
    }

    const routes = routeReview(files, trustVerdict)

    const config = {
      files,
      change_description: change,
      trust_verdict: trustVerdict,
      routed_to: routes,
      routing_rationale: routes.map(r => `${r}: triggered by keywords in file paths/change description`),
      workflow: "review-route-flow.md",
    }

    if (args?.json) {
      return { success: true, data: { config, phase: state.phase }, meta: { formatted: "json", timestamp: timestamp() } }
    }

    const lines = [
      "═".repeat(60),
      "Human Review Routing",
      "─".repeat(60),
      `  Files:        ${files.length > 0 ? files.join(", ") : "(all changed files)"}`,
      `  Trust verdict: ${trustVerdict}`,
      `  Route to:     ${routes.length > 0 ? routes.join(", ") : "general reviewer"}`,
      "─".repeat(60),
      "  Routing logic: keyword match + patch trust score",
      "═".repeat(60),
    ]

    return { success: true, message: lines.join("\n"), config, phase: state.phase, routed_to: routes, meta: { formatted: "table", timestamp: timestamp() } }
  },
}
