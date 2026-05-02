# /fd-evaluate-risk

**Standalone risk assessment command** — estimates change risk, confidence, likely regression categories, and whether human approval is needed before proceeding.

Works with a change description alone (keyword-based) or with a specific file path (trust score + keyword combined).

---

## Usage

```
/fd-evaluate-risk --change "<description>" [--file "<path>"] [flags]
```

## Arguments

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--change` | string | — | Plain-language description of the proposed change |
| `--file` | string | — | Specific file being changed (enables patch trust scoring) |
| `--volatility` | boolean | true | Include volatile zone count in analysis |
| `--json` | boolean | false | Return raw JSON instead of table |

At least one of `--change` or `--file` is required.

---

## Risk levels

| Level | Score | Meaning |
|-------|-------|---------|
| `low` | 80–100 | Safe to proceed without approval |
| `medium` | 50–79 | Proceed with care; review recommended |
| `high` | 25–49 | Approval required; consider safer alternative |
| `critical` | 0–24 | Approval required; safer alternative strongly recommended |

**Approval is required when:** `risk_score < 60` OR `≥3 regression categories predicted`.

---

## Output

```
════════════════════════════════════════════════════════════
fd-evaluate-risk
────────────────────────────────────────────────────────────
  Change:      replace JWT with session tokens
  File:        src/auth/token.ts
────────────────────────────────────────────────────────────
  ⚠ Risk level:  HIGH (score: 38/100)
  Confidence:  72/100 (codebase context coverage)
  Approval:    REQUIRED
  Regressions: auth, security, async-flow
  Hot zones:   src/auth/
  Signals:     volatile path, auth keyword
────────────────────────────────────────────────────────────
  Safer alt:   Consider a feature-flag rollout before swapping auth tokens
────────────────────────────────────────────────────────────
  researcher → map to affected paths
  reviewer   → validate risk + regressions
  security   → targeted review of high-risk areas
════════════════════════════════════════════════════════════
```

### Fields returned

| Field | Description |
|-------|-------------|
| `risk_score` | 0–100 (higher = less risky) |
| `risk_level` | low / medium / high / critical |
| `confidence` | 0–100 (how much codebase context data exists) |
| `approval_needed` | boolean — whether human approval is required |
| `likely_regressions` | predicted regression categories from change keywords |
| `volatile_zones` | count of volatile/critical zones in the repo |
| `volatile_matches` | paths that match the change description |
| `safer_alternative` | suggested safer approach if risk is high/critical |
| `trust_signals` | risk signals from the patch trust scorer |

---

## Regression categories detected

| Category | Triggered by keywords |
|----------|----------------------|
| performance | slow, latency, cache, query, index, bulk, batch, load |
| auth | auth, token, session, jwt, oauth, permission, rbac, login |
| schema | schema, migration, column, table, foreign key, constraint |
| ui-state | state, redux, context, store, hook, render, component |
| async-flow | async, await, promise, callback, event, queue, worker |
| api-contract | api, endpoint, route, request, response, payload, version |
| data-integrity | transaction, rollback, constraint, unique, required, nullable |
| security | secret, password, encrypt, decrypt, hash, sanitize |
| config | env, config, setting, flag, feature flag, toggle |
| i18n | locale, translation, i18n, format, timezone, language |

---

## Confidence score

Confidence reflects how much codebase context data the system has:

| Data source | Points |
|-------------|--------|
| `.codebase/ARCHITECTURE.md` exists | +20 |
| `.codebase/STACK.md` exists | +10 |
| `.codebase/MEMORY.json` node count | up to +25 |
| `.codebase/VOLATILITY.json` entries | up to +15 |
| `.codebase/FAILURES.json` entries | up to +10 |
| Base | +20 |

Run `/fd-map-codebase` and let FlowDeck index the repo to increase confidence.

---

## Examples

```bash
# Keyword-based risk estimate
/fd-evaluate-risk --change "refactor JWT auth to use session tokens"

# File + change (enables patch trust scoring)
/fd-evaluate-risk --change "update stripe webhook" --file "src/payment/webhook.ts"

# JSON output for CI decision gates
/fd-evaluate-risk --change "drop users table column" --json
```

---

## Agents dispatched

- `researcher` — maps change description to affected modules and paths
- `reviewer` — validates risk level and regression predictions
- `security-auditor` — targeted review (only when risk is high or critical)
