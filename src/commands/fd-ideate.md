---
description: Ideation Tool — convert vague ideas into organized workflows with phases, agents, and dependency maps
argument-hint: [vague idea, e.g. "make checkout faster"]
---

# Ideate

Convert a vague or high-level idea into a structured, organized workflow.

**Input:** $ARGUMENTS — a vague or high-level request (e.g., "make checkout faster", "improve auth security")

## Steps

### Step 1: Explore Codebase Context

Explore the repository for relevant context:
- Read `.codebase/ARCHITECTURE.md` for system design overview
- Read `.codebase/STACK.md` for tech stack
- Read `.codebase/CONVENTIONS.md` for code patterns
- Use the `idea-to-workflow` tool with the idea as input to get a structured `IdeaWorkflowResult`

### Step 2: Decompose with @ideator

Invoke `@ideator` with:
- The original vague idea
- Codebase context from Step 1
- The structured result from the `idea-to-workflow` tool

The `@ideator` agent will produce a detailed decomposition with:
- Sub-tasks with clear boundaries
- Dependency graph between tasks
- Phase assignments with parallel groups
- Agent recommendations per task
- Effort estimates and risk assessment
- Success criteria per phase

### Step 3: Write IDEATE.md

Save the structured workflow to `.planning/phases/phase-1/IDEATE.md`:

```markdown
# Ideation: $ARGUMENTS

**Date:** <current timestamp>
**Status:** draft

## Workflow Overview

<summary of the decomposition>

## Phases

### Phase 1: <name>
**Effort:** <S|M|L> | **Risk:** <low|med|high>

| Task | Agent | Depends On | Effort | Success Criteria |
|------|-------|-----------|--------|-----------------|
| <task> | @<agent> | <deps> | <S/M/L> | <criteria> |

...

## Dependency Graph

<mermaid graph or bullet list of edges>

## Agent Assignments

| Agent | Tasks |
|-------|-------|
| @backend-coder | <tasks> |
| @tester | <tasks> |
...

## Risk Assessment

- <risk factor>: <mitigation>

## Next Steps

1. Run `/fd-discuss` to refine requirements with interactive Q&A
2. Run `/fd-plan` to create an implementation plan
3. Run `/fd-execute` to implement
```

### Step 4: Present Summary

Display a summary of the workflow:
- Number of phases
- Number of tasks
- Agent assignments
- Effort estimate
- Risk level
- Suggested workflow class

Present the next steps: `/fd-discuss` to refine, `/fd-plan` to plan, or `/fd-execute` for simple tasks.

## Output Format

```
════════════════════════════════════════════
IDEATION RESULT: "$ARGUMENTS"
════════════════════════════════════════════

Phases: <N>
Tasks: <N>
Agents involved: <list>
Total effort: <S|M|L|XL>
Risk: <low|medium|high>
Suggested workflow: <class>

────────────────────────────────────────────
Next Steps
────────────────────────────────────────────
1. /fd-discuss    — refine requirements (recommended for complex ideas)
2. /fd-plan       — create implementation plan
3. /fd-execute    — implement directly (for simple/quick workflows)
```

## Error Handling

- If the `idea-to-workflow` tool returns an error: report the error and suggest simplifying the input
- If `@ideator` is unavailable: fall back to the raw tool output
- No partial state saved on error
