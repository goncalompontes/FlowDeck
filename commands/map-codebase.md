---
description: Map the codebase structure into .codebase/ files for AI context
argument-hint: "[--full] [--update]"
---

Analyze and document the codebase for AI agent context.

**What this does:**
1. Scans the project structure (entry points, modules, dependencies)
2. Identifies key files, patterns, and conventions
3. Writes structured summaries to `.codebase/`:
   - `ARCHITECTURE.md` — high-level system design
   - `CONVENTIONS.md` — naming, style, and patterns used in this project
   - `DEPENDENCIES.md` — external packages and what they're used for
   - `INDEX.md` — file-by-file inventory

**Flags:**
- `--full` — Deep scan (reads every file, slower but thorough)
- `--update` — Refresh existing `.codebase/` files with recent changes

**Why this matters:** Agents use `.codebase/` for context instead of re-scanning on every task.

## What Next?

1. **Start discussion** → `/discuss`
2. **Write documentation** → `/write-docs`
3. **View dashboard** → `/dashboard`
