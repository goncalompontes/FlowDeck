---
name: fix-bug-flow
description: "Systematic bug fix workflow: reproduce → isolate → write failing test → fix root cause → review → verify"
triggers:
  - /fix-bug
steps:
  - name: load_context
    agent: "@orchestrator"
    action: Read STATE.md, ARCHITECTURE.md, CONVENTIONS.md
  - name: reproduce
    agent: "@debug-specialist"
    action: Reproduce the bug with minimal case; document inputs and expected vs actual
  - name: isolate
    agent: "@researcher"
    action: Researcher investigates root cause; traces stack, reads related code
  - name: write_test
    agent: "@tester"
    action: Tester writes a failing regression test that reproduces the bug
  - name: fix
    agent: "@coder"
    action: Coder fixes root cause (not symptom); minimal change that makes test pass
  - name: review
    agent: "@reviewer"
    action: Reviewer checks fix for quality and security regressions
  - name: verify
    agent: "@tester"
    action: Run full test suite; confirm regression test passes
  - name: update_state
    agent: "@orchestrator"
    action: Update STATE.md with fix summary
---

# Fix Bug Flow

## Purpose

Fix a reported bug with a regression test that prevents recurrence.

## Prerequisites

- `.planning/` initialized
- Bug description or reproduction steps available

## Process

### Step 1: Load Context

Read:
- `.planning/STATE.md` — current phase
- `.codebase/ARCHITECTURE.md` — system structure
- `.codebase/CONVENTIONS.md` — coding standards

### Step 2: Reproduce

Identify minimal reproduction:
- What inputs trigger the bug?
- What is the expected behavior?
- What is the actual behavior?

Document in a comment or issue before touching code.

### Step 3: Isolate Root Cause

Spawn `@researcher` to investigate:
- Trace the execution path
- Read the stack trace completely (never half-read)
- Check recent changes to related files: `git log --oneline -20 -- <file>`
- Identify root cause (not just the symptom)

### Step 4: Write Failing Test

Spawn `@tester` to write a regression test:
- Test must FAIL on current code
- Named: `test('should <expected> when <condition>')`
- Tests the bug scenario exactly

### Step 5: Fix

Spawn `@coder` to implement the fix:
- Fix the root cause identified in Step 3
- Minimum code change that makes the regression test pass
- Do NOT touch unrelated code

If fix requires diverging from expected approach, STOP and brief orchestrator.

### Step 6: Review

Spawn `@reviewer` to check:
- Fix is correct and complete
- No new security issues introduced
- No regressions in related code

### Step 7: Verify

```bash
# Run regression test — must PASS
# Run full test suite — must all PASS
npm test
```

### Step 8: Update State

Update STATE.md:
- Record bug description and fix
- Update `last_action` to "Bug fixed: [description]"

## Output

```
## Bug Fix Complete

**Bug:** [description]
**Root cause:** [what caused it]
**Fix:** [what was changed, file:line]
**Regression test:** [test name]
**Test result:** ✅ PASS
```

## Error handling

- If root cause unclear: spawn `@debug-specialist` for deeper analysis
- If fix breaks other tests: revert, reassess root cause
- Never suppress the error to make the test pass
