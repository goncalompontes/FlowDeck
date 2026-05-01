# /fd-guarded-edit

**Edit gate command** — evaluates a proposed file change before it is applied and returns a binding gate decision.

Combines: patch trust scoring, architectural constraint checking, policy enforcement, volatility analysis, and failure history into a single pass/block decision.

---

## Usage

```
/fd-guarded-edit --file "<path>" --change "<description>" [flags]
```

## Arguments

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--file` | string | — | File path being changed |
| `--change` | string | — | Plain-language description of the change |
| `--dry-run` | boolean | false | Evaluate without recording or side effects |
| `--json` | boolean | false | Return raw JSON instead of table |

At least one of `--file` or `--change` is required.

---

## Gate decisions

| Decision | Meaning |
|----------|---------|
| `auto-approve` | Apply — no action needed (trust ≥70, no violations, stable file) |
| `require-confirmation` | Review the diff carefully, then confirm (volatile file, guarded mode, or prior failures) |
| `require-review` | Route to human reviewer — do not auto-apply (trust <40 or policy violation) |
| `block` | Do NOT apply — arch constraint violation or critical policy breach |

### Decision priority (highest first)

1. Arch constraint violated → **block**
2. Policy violation + trust < 30 → **block**
3. `review-only` execution mode → **require-review**
4. Trust < 40 OR any policy violation → **require-review**
5. `guarded` execution mode OR volatile file OR prior failures → **require-confirmation**
6. All else → **auto-approve**

---

## Output

```
════════════════════════════════════════════════════════════
fd-guarded-edit
────────────────────────────────────────────────────────────
  File:   src/auth/token.ts
  Change: replace jwt secret rotation logic
────────────────────────────────────────────────────────────
  ⚑ Decision:    REQUIRE-REVIEW
  Reason:       High risk: trust score 32/100, 0 policy violation(s)
  Risk score:   32/100 (high-risk)
  Exec mode:    guarded
  Prior fails:  F-023, F-031
────────────────────────────────────────────────────────────
  → Route to human reviewer before applying — do not auto-apply
════════════════════════════════════════════════════════════
```

### Fields returned

| Field | Description |
|-------|-------------|
| `decision` | Gate decision string |
| `reason` | Explanation for the decision |
| `risk_score` | Patch trust score 0–100 |
| `execution_mode` | Current repo execution mode (auto/guarded/review-only) |
| `policy_violations` | Policy rule strings that were triggered |
| `volatile_files` | Files that matched volatile/critical zones |
| `prior_failures` | Failure IDs for prior failures on this path |
| `arch_constraint` | Whether an architectural constraint was violated |
| `recommended_action` | Plain-language next step |

---

## Examples

```bash
# Check before editing auth token logic
/fd-guarded-edit --file "src/auth/token.ts" --change "replace secret rotation"

# Dry run (evaluate without recording)
/fd-guarded-edit --file "src/payment/webhook.ts" --change "update stripe handler" --dry-run

# JSON for CI/CD pipeline integration
/fd-guarded-edit --file "src/core/engine.ts" --change "patch core engine" --json
```

---

## Data sources read

- `.codebase/POLICIES.json` — active policy rules
- `.codebase/VOLATILITY.json` — volatile/critical paths
- `.codebase/FAILURES.json` — unresolved prior failures per path
- `.codebase/CONSTRAINTS.md` — forbidden path patterns
- `.planning/config.json` — execution mode setting
- Patch trust scorer — keyword + volatility scoring
