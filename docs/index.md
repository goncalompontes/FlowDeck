# FlowDeck Documentation

FlowDeck is an OpenCode plugin that brings structured, multi-agent workflow orchestration to your development sessions. It coordinates 23 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state stored in your project's `.planning/` directory.

---

## Getting Started

| Document | Description |
|----------|-------------|
| [Installation](installation.md) | Prerequisites, all three install methods, verification commands, and how to uninstall |
| [Quick Start](quick-start.md) | Step-by-step walkthrough of your first 15 minutes with FlowDeck |

---

## Reference

| Document | Description |
|----------|-------------|
| [Agents](agents.md) | All 23 agents — names, roles, models, and when to invoke each one |
| [Skills](skills.md) | All 24 skills — what each skill does and example prompts that activate it |
| [Commands](commands.md) | All 23 slash commands — syntax, arguments, and what each command triggers |
| [Workflows](workflows.md) | All 14 built-in workflows — flow diagrams, inputs, outputs, and agent involvement |
| [Rules](rules.md) | Language and common rule files — what they enforce and how to activate them |
| [Intelligence Features](intelligence.md) | 15 AI-safety features: impact radar, patch trust, blast radius, decision trace, and more |

---

## Advanced

| Document | Description |
|----------|-------------|
| [Parallel Execution](parallel-execution.md) | How FlowDeck fans out independent tasks across multiple agents simultaneously |
| [Multi-Repo](multi-repo.md) | Coordinating changes across two or more repositories in a single session |
| [Notifications](notifications.md) | Desktop and system alerts for long-running task completion |

---

## Setup & Maintenance

| Document | Description |
|----------|-------------|
| [Configuration](configuration.md) | `opencode.json` fields, project config schema, environment variables, and plugin tools |
| [Troubleshooting](troubleshooting.md) | Fixes for the most common problems: missing agents, corrupted state, build failures |

---

## Quick Command Cheat Sheet

| Command | What it does |
|---------|--------------|
| `/new-project <name>` | Initialize `.planning/` directory structure for a new project |
| `/discuss <phase>` | Run structured requirements Q&A with `@discusser` |
| `/plan <phase>` | Generate a wave-structured `PLAN.md` (requires `CONFIRMED` to execute) |
| `/new-feature "<description>"` | Execute full feature workflow via `@orchestrator` |
| `/review-code [staged\|branch]` | Parallel review by `@reviewer`, `@security-auditor`, `@tester` |
| `/fix-bug "<description>"` | Diagnose and fix a bug with regression test |
| `/checkpoint` | Save current state — safe to close the session after this |
| `/resume` | Reload `STATE.md` and `PLAN.md` context in a new session |
| `/progress` | Print current state, active plan, and recent results |
| `/map-codebase` | Generate `.codebase/` documentation from source analysis |
| `/roadmap` | View or update phase statuses and milestones |
| `/dashboard` | Open the project dashboard with phase progress and blockers |
| `/deploy-check` | Run pre-deployment checks and produce a go/no-go verdict |
| `/write-docs` | Generate or update project documentation |
| `/multi-repo` | Coordinate a change across multiple registered repositories |
| `/settings` | View or update FlowDeck model assignments and configuration |
| `/impact-radar` | Predict affected files/APIs/tests before editing |
| `/blast-radius` | Show downstream consequences and hidden dependencies of a change |
| `/translate-intent` | Convert vague request into ranked concrete implementation options |
| `/volatility-map` | Show unstable code zones by churn and hotfix frequency |
| `/regression-predict` | Estimate likely regression categories before making a change |
| `/test-gap` | Identify weakly-tested areas in a proposed change |
| `/review-route` | Route risky patches to security, backend, infra, or domain reviewers |
