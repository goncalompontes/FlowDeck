# Command Architecture & Migration Guide

FlowDeck v2 consolidates seven individual analysis commands into four umbrella commands, reducing the top-level command surface while keeping all capabilities. The 15 workflow commands remain as separate top-level slash commands.

---

## Command Map

### Workflow commands (unchanged — 15 total)

These remain as separate top-level commands:

| Command | Purpose |
|---------|---------|
| `/fd-new-project` | Bootstrap a new project |
| `/fd-map-codebase` | Analyse and index the codebase |
| `/fd-settings` | Configure FlowDeck settings |
| `/fd-discuss` | Pre-planning discussion with impact radar |
| `/fd-plan` | Generate a phase plan |
| `/fd-roadmap` | View / update project roadmap |
| `/fd-dashboard` | Visual progress dashboard |
| `/fd-ask` | Smart agent dispatch |
| `/fd-new-feature` | Implement a new feature |
| `/fd-fix-bug` | Fix a bug with failure replay |
| `/fd-review-code` | Code review with impact radar |
| `/fd-write-docs` | Generate documentation |
| `/fd-deploy-check` | Pre-deploy safety check |
| `/fd-progress` | View project progress |
| `/fd-checkpoint` | Save a session checkpoint |
| `/fd-resume` | Resume from checkpoint |
| `/fd-multi-repo` | Multi-repo management |

### Analysis commands — old → new mapping

| Old command | New umbrella command | Flag |
|-------------|---------------------|------|
| `/fd-impact-radar` | `/fd-analyze-change` | `--impact` |
| `/fd-blast-radius` | `/fd-analyze-change` | `--blast-radius` |
| `/fd-regression-predict` | `/fd-analyze-change` | `--regression` |
| `/fd-test-gap` | `/fd-analyze-change` | `--test-gap` |
| `/fd-volatility-map` | `/fd-analyze-change` | `--volatility` |
| `/fd-review-route` | `/fd-analyze-change` | `--review-route` |
| `/fd-translate-intent` | `/fd-translate-intent` | *(enhanced, kept as-is)* |
| *(new)* | `/fd-guarded-edit` | — |
| *(new)* | `/fd-evaluate-risk` | — |

### New umbrella commands (4 total)

| Command | Replaces / Adds |
|---------|----------------|
| `/fd-analyze-change` | Combines 6 analysis commands; `--all` runs all modules |
| `/fd-guarded-edit` | New — edit gate decision (auto/confirm/review/block) |
| `/fd-evaluate-risk` | New — standalone risk + regression assessment |
| `/fd-translate-intent` | Enhanced — adds `assumptions`, `recommended_option`, `clarifying_questions` |

---

## Architecture

### Command layer

Commands are thin entry points that dispatch to agent pipelines or shared utilities. No analysis logic lives inside command files.

```
User runs: /fd-analyze-change --change "..." --impact --regression
     ↓
analyzeChangeCommand.execute()
     ↓
  reads: VOLATILITY.json, FAILURES.json, MEMORY.json via shared libs
  calls: runImpactRadar(), scorePatch()
     ↓
  returns: unified config object with agent pipeline + aggregated data
```

### Agent layer

Agents are modular and reusable across commands:

| Agent | Used by |
|-------|---------|
| `architect` | `/fd-analyze-change`, `/fd-translate-intent`, `/fd-plan` |
| `researcher` | `/fd-analyze-change`, `/fd-evaluate-risk`, `/fd-discuss` |
| `tester` | `/fd-analyze-change` |
| `reviewer` | `/fd-analyze-change`, `/fd-evaluate-risk`, `/fd-review-code` |
| `security-auditor` | `/fd-evaluate-risk` (high/critical risk), `/fd-review-code` |
| `risk-analyst` | `/fd-evaluate-risk`, `/fd-guarded-edit` |
| `policy-enforcer` | `/fd-guarded-edit` |

### Plugin hooks

Hooks intercept tool execution and enforce safety policies at the infrastructure layer:

| Hook | Function |
|------|---------|
| `tool.execute.before` | `toolGuardHook` — blocks dangerous read/write/bash/edit |
| `tool.execute.before` | `guardRailsHook` — enforces execution mode (auto/guarded/review-only) |
| `tool.execute.before` | `patchTrustHook` — scores writes/edits; blocks high-risk without approval |
| `tool.execute.before` | `decisionTraceHook` — records every edit to DECISIONS.jsonl |
| `session.started` | `sessionStartHook` — announces FlowDeck, loads context |
| `command.execute.before` | Command routing — dispatches slash commands |

### Shared libraries

Reusable utilities consumed by multiple commands:

| Module | Exports |
|--------|---------|
| `src/lib/impact-radar.ts` | `runImpactRadar()`, `impactRadarSummaryLines()`, `lookupPriorFailures()` |
| `src/hooks/patch-trust.ts` | `scorePatch()` |
| `src/hooks/guard-rails.ts` | `resolveExecutionMode()` |
| `src/hooks/tool-guard.ts` | `checkArchConstraint()`, `isBlocked()` |
| `src/tools/planning-state-lib.ts` | `statePath()`, `codebaseDir()`, `readPlanningState()`, `timestamp()` |

### Data files (`.codebase/`)

| File | Purpose |
|------|---------|
| `MEMORY.json` | Architecture graph — modules, ownership, types |
| `FAILURES.json` | Failure history — root causes, tags, recurrence counts |
| `DECISIONS.jsonl` | Append-only edit audit log |
| `VOLATILITY.json` | Churn metrics — stability ratings per path |
| `POLICIES.json` | Self-healing policy rules |
| `CONSTRAINTS.md` | Forbidden paths and architectural boundaries |
| `ARCHITECTURE.md` | High-level architecture notes (written by `/fd-map-codebase`) |
| `STACK.md` | Technology stack reference |

---

## Migration Plan

### For existing users

**All old commands still work.** No action required. Old commands were not removed.

**When to migrate:**

| If you used to run | Now prefer |
|-------------------|-----------|
| `/fd-impact-radar --change "..."` | `/fd-analyze-change --change "..." --impact` |
| Multiple analysis commands in sequence | `/fd-analyze-change --change "..." --all` |
| Manual pre-edit risk assessment | `/fd-evaluate-risk --change "..." --file "..."` |
| Manually deciding whether to apply a change | `/fd-guarded-edit --file "..." --change "..."` |
| `/fd-translate-intent --intent "..."` | Same — now returns `assumptions` and `recommended_option` |

### Quick start for new workflows

**Before any significant edit:**
```bash
# 1. Translate vague intent to concrete options
/fd-translate-intent --intent "make checkout faster"

# 2. Full pre-change analysis
/fd-analyze-change --change "add Redis cache for checkout queries"

# 3. Gate decision for the specific file
/fd-guarded-edit --file "src/checkout/query.ts" --change "add Redis cache layer"
```

**In CI/CD pipelines:**
```bash
# Risk gate — fail if approval required
/fd-evaluate-risk --change "<PR description>" --json | jq '.approval_needed'

# Edit gate — fail if block decision
/fd-guarded-edit --file "<changed file>" --json | jq '.decision == "block"'
```

---

## Backward compatibility notes

- All 7 original intelligence commands (`/fd-impact-radar`, `/fd-blast-radius`, `/fd-regression-predict`, `/fd-test-gap`, `/fd-volatility-map`, `/fd-review-route`, `/fd-translate-intent`) remain registered and functional.
- Their implementations were not modified (except `/fd-translate-intent` which gained `assumptions`, `recommended_option`, and `clarifying_questions` in its output spec).
- The new umbrella commands are registered alongside the old ones — no commands were removed.
- Existing scripts, keybindings, or workflows that call the old commands will continue to work without changes.
