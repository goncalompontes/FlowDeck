# /fd-analyze-change

**Umbrella analysis command** — runs up to 6 analysis modules in a single pass and produces a consolidated pre-change risk report.

Replaces individual calls to `/fd-impact-radar`, `/fd-blast-radius`, `/fd-regression-predict`, `/fd-test-gap`, `/fd-volatility-map`, and `/fd-review-route`.

---

## Usage

```
/fd-analyze-change --change "<what's changing>" [flags]
```

## Arguments

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--change` | string | — | Description of the proposed change |
| `--scope` | string | `"all"` | Module or file path scope |
| `--files` | string | — | Comma-separated file paths |
| `--depth` | number | `2` | Blast radius traversal depth |
| `--impact` | boolean | false | Run impact radar module |
| `--blast-radius` | boolean | false | Run blast radius module |
| `--regression` | boolean | false | Run regression prediction module |
| `--test-gap` | boolean | false | Run test gap detection module |
| `--volatility` | boolean | false | Run volatility map module |
| `--review-route` | boolean | false | Run reviewer routing module |
| `--all` | boolean | false | Force all modules (default when no module flags given) |
| `--json` | boolean | false | Return raw JSON instead of table |

**Default behaviour:** If no module flags are specified, all 6 modules run automatically.

---

## Output

```
════════════════════════════════════════════════════════════════
fd-analyze-change
────────────────────────────────────────────────────────────────
  Change:   update JWT token expiry
  Scope:    all
  Modules:  impact-radar, blast-radius, regression-predict, test-gap, volatility-map, review-route
────────────────────────────────────────────────────────────────
  ⚠ Affected zones:   src/auth/, src/session/, src/middleware/
  ⚠ Known failures:   F-023, F-031
  ≈ Regression cats:  auth, performance, async-flow...
  ✗ Test gap types:   5 gap patterns checked
  → Route to:          security, backend
────────────────────────────────────────────────────────────────
  ⚠ HIGH RISK: 3 volatile zone(s), 2 known failure(s), 1 fragile pattern(s)
════════════════════════════════════════════════════════════════
```

### Top-level fields returned

| Field | Description |
|-------|-------------|
| `modules_run` | Which analysis modules were executed |
| `affected_zones` | Volatile/critical file paths matching the change |
| `recommended_reviewers` | Reviewer types suggested (security, backend, infra, etc.) |
| `risk_summary` | Human-readable risk advisory |
| `risk_score` | Numeric score 0–100 (higher = lower risk) |
| `config` | Full agent pipeline config dispatched to agents |

---

## Examples

```bash
# Full analysis before editing auth middleware
/fd-analyze-change --change "replace JWT with session tokens" --files "src/auth/token.ts"

# Impact + regression only (partial analysis)
/fd-analyze-change --change "refactor database connection pool" --impact --regression

# JSON output for scripting
/fd-analyze-change --change "update payment webhook handler" --json

# Deep blast radius (3 levels)
/fd-analyze-change --change "extract user service" --blast-radius --depth 3
```

---

## Old commands (still supported)

These individual commands remain available and still work. Use `/fd-analyze-change` for combined analysis:

| Old command | Equivalent flag |
|-------------|----------------|
| `/fd-impact-radar` | `--impact` |
| `/fd-blast-radius` | `--blast-radius` |
| `/fd-regression-predict` | `--regression` |
| `/fd-test-gap` | `--test-gap` |
| `/fd-volatility-map` | `--volatility` |
| `/fd-review-route` | `--review-route` |

---

## Agents dispatched

- `researcher` — traces dependency graph from changed paths
- `architect` — maps blast radius to configured depth, flags integration points
- `tester` — estimates coverage gaps per regression category and test gap types
- `reviewer` — ranks gaps by risk and confirms routing
