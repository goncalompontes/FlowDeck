---
name: execute-flow
description: "Orchestrates execution (guard check → load plan → identify next step → parallel execute → review → update state)"
triggers:
  - /new-feature
steps:
  - name: guard_check
    agent: "@orchestrator"
    priority: first
    action: Verify .planning/ and .codebase/ exist, plan is confirmed
  - name: load_plan
    agent: "@orchestrator"
    action: Read active PLAN.md from current phase directory
  - name: identify_next_step
    agent: "@orchestrator"
    action: Find first incomplete step (not in steps_complete)
  - name: parallel_execute
    agent: "@coder"
    action: If steps are independent, execute in parallel via @coder agents
  - name: review
    agent: "@reviewer"
    action: Run @reviewer on completed work
  - name: update_state
    agent: "@orchestrator"
    action: Mark step complete via planning-state tool
  - name: loop_or_complete
    agent: "@orchestrator"
    action: If more steps, return to identify_next_step; if all done, update phase status
---

# Execute Flow

## Purpose

Orchestrates the execution of a confirmed PLAN.md. Coordinates @coder, @reviewer, and @tester agents to implement plan steps.

## Prerequisites

Before executing, verify:
1. `.planning/` exists (project initialized)
2. `.codebase/` exists (codebase mapped)
3. `PLAN.md` is confirmed (via /plan phase)

If any prerequisite fails, abort with clear error.

## Process

### Step 1: Guard Check

Verify prerequisites:
- `.planning/` directory exists
- `.codebase/` directory exists
- `STATE.md` has `plan_confirmed: true`
- `PLAN.md` exists in current phase directory

If any check fails:
```
Error: Missing prerequisite for execution.
- .planning/: [exists/missing]
- .codebase/: [exists/missing]
- plan_confirmed: [true/false]
Run /new-project, /map-codebase, and /plan first.
```

### Step 2: Load Plan

Read the active PLAN.md from the current phase directory.
Parse the tasks list and identify which steps are complete.

### Step 3: Identify Next Step

From PLAN.md, find the first step that is NOT in `steps_complete`.
If all steps are complete, skip to Step 7 (loop_or_complete).

### Step 4: Parallel Execute

For independent steps:
- Spawn multiple @coder agents in parallel
- Each agent implements its assigned task
- Use worktree isolation for parallel execution (D-04)

For dependent steps:
- Execute sequentially in dependency order
- Each step must complete before next begins

### Step 5: Review

After step(s) complete:
- Spawn @reviewer agent to review completed work
- Check code quality, security, conventions
- If issues found, return to Step 4 for fixes

### Step 6: Update State

Mark completed step via planning-state tool:
```
mark_step_complete(step=N, summary="[brief description]")
```

Update STATE.md:
- Add step to `steps_complete`
- Remove from `steps_pending`
- Update `last_action`

### Step 7: Loop or Complete

If more steps pending:
- Return to Step 3 (identify next step)

If all steps complete:
- Update STATE.md phase status to "complete"
- Update ROADMAP.md progress
- Present completion summary

## Wave-Based Execution

WF-03 respects wave structure from PLAN.md:
- Wave 1 steps execute first
- Wave 2 steps execute after Wave 1 completes
- Wave 3 steps execute after Wave 2 completes
- No intra-wave dependencies (parallel execution)

## Error Handling

D-03: Fail fast with clear error
- If guard check fails: abort with clear error and remediation
- If @coder fails: report failure, offer retry or skip
- If @reviewer finds critical issues: return to Step 4 for fixes
- No partial state saved on error

## Agent Coordination

Uses Phase 3 agents:
- @orchestrator — coordinates execution (Phase 3 AGENT-01)
- @coder — implements tasks (Phase 3 AGENT-04)
- @reviewer — reviews quality (Phase 3 AGENT-05)
- @tester — runs tests (Phase 3 AGENT-07)

## State Updates

STATE.md updates after each step:
```yaml
steps_complete: [1, 2]      # Added after step 2
steps_pending: [3, 4, 5]   # Removed step 2
last_action: "Step 2 complete: [description]"
```

Full phase completion:
```yaml
status: complete
last_action: "Phase N complete — all steps finished"
```
