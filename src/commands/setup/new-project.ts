import { writeFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { planningDir } from "../../tools/planning-state-lib"

const PLANNING_FILES = {
  "PROJECT.md": `# Project

**Name:** (set via /discuss)
**Description:** (set via /discuss)
**Tech stack:** (set via /discuss)

---

## Goals

-

## Non-negotiables

-

## Out of Scope

-
`,
  "REQUIREMENTS.md": `# Requirements

**Project:** (set via /discuss)
**Version:** 1.0

---

## v1 Requirements


`,
  "ROADMAP.md": `# Roadmap

**Project:** (set via /discuss)
**Version:** 1.0

---

## Overview

| Phase | Name | Purpose |
|-------|------|---------|
| 1 | Plugin Infrastructure & Core Tools | |
| 2 | Hooks & Session Lifecycle | |
| 3 | Agent Definitions | |
| 4 | Setup & Planning Commands | |
| 5 | Execution Commands | |
| 6 | Installation & Documentation | |

---
`,
  "STATE.md": `---
flowdeck_state_version: 1.0
milestone: v1.0
last_updated: "TEMPLATE_TIMESTAMP"
progress:
  total_phases: 6
  completed_phases: 0
---

# State

**Project:** (set via /discuss)
**Last updated:** TEMPLATE_TIMESTAMP

## Current Phase

phase: 1
status: planned
plan_file: none
plan_confirmed: false
confirmed_at: none

## Progress

last_action: ""
next_action: "Run /discuss to start planning"
steps_complete: []
steps_pending: []

## Blockers

- none

## Session History

`,
  "config.json": `{
  "workflow": {
    "parallelization": true,
    "auto_advance": false,
    "discuss_mode": "discuss"
  },
  "agents": {
    "orchestrator": "anthropic/claude-sonnet-4-5",
    "discusser": "anthropic/claude-sonnet-4-5",
    "mapper": "google/gemini-2.5-flash",
    "coder": "anthropic/claude-opus-4-5",
    "reviewer": "google/gemini-2.5-flash",
    "researcher": "openai/gpt-4o",
    "tester": "anthropic/claude-haiku-4-5",
    "writer": "anthropic/claude-haiku-4-5"
  }
}
`,
}

export const newProjectCommand = {
  name: "fd-new-project",
  description: "Initialize .planning/ structure for greenfield projects",
  async execute(context) {
    const dir = context.directory ?? process.cwd()
    const pd = planningDir(dir)

    // D-08: Idempotency — check if .planning/ already exists
    if (existsSync(pd)) {
      return {
        error: `.planning/ already exists. Use /resume to continue or /progress to see state.`,
        code: "ALREADY_EXISTS",
      }
    }

    // Create .planning/ directory
    mkdirSync(pd, { recursive: true })
    mkdirSync(join(pd, "phases"), { recursive: true })

    // Create all planning files
    const timestamp = new Date().toISOString()

    for (const [filename, content] of Object.entries(PLANNING_FILES)) {
      const filePath = join(pd, filename)
      if (filename === "STATE.md") {
        const stateContent = content.replace(/TEMPLATE_TIMESTAMP/g, timestamp)
        writeFileSync(filePath, stateContent, "utf-8")
      } else if (filename === "config.json") {
        writeFileSync(filePath, content, "utf-8")
      } else {
        writeFileSync(filePath, content, "utf-8")
      }
    }

    return {
      success: true,
      message: `.planning/ structure created. Run /discuss to capture project decisions.`,
      files: Object.keys(PLANNING_FILES),
    }
  },
}
