---
description: Create a detailed implementation plan from requirements — saves PLAN.md, requires confirmation before execution
argument-hint: "[phase-number]"
---

Create a step-by-step implementation plan for the current (or specified) phase.

**What this does:**
1. Reads `.planning/phases/phase-N/DISCUSS.md` for locked decisions
2. Reads `.codebase/ARCHITECTURE.md` for system context (if mapped)
3. Breaks the feature into ordered, atomic steps
4. Identifies dependencies between steps
5. Saves to `.planning/phases/phase-N/PLAN.md`
6. Asks for your confirmation before marking phase as `execute`-ready

**Plan format:**
```
## Phase N: [Name]
### Step 1: [Action] — [file path]
### Step 2: [Action] — [file path]
...
```

**Next step:** Run `/fd-new-feature` to execute the confirmed plan.

## What Next?

After plan is confirmed, choose your next step:

1. **Start feature implementation** → `/fd-new-feature [description]`
2. **Revisit discussion** → `/fd-discuss [phase-number]`
3. **View progress** → `/fd-progress`
4. **Check dashboard** → `/fd-dashboard`
