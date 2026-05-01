---
description: Initialize a new FlowDeck project — creates .planning/ directory structure
argument-hint: "[project-name]"
---

Initialize FlowDeck in the current project directory.

**What this does:**
1. Creates `.planning/` directory structure:
   - `STATE.md` — current phase and status
   - `PROJECT.md` — project overview (you fill this in)
   - `phases/` — one subdirectory per roadmap phase
2. Optionally runs `/fd-map-codebase` to analyze existing code
3. Guides you to set the initial phase

**Use this when:** Starting a new feature sprint, onboarding to an existing project, or setting up FlowDeck for the first time.

**Next step:** Run `/fd-map-codebase` to document the codebase, then `/fd-discuss` to start planning.

## What Next?

1. **Map codebase** → `/fd-map-codebase`
2. **Start discussion** → `/fd-discuss`
3. **View dashboard** → `/fd-dashboard`
