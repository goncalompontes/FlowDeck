# FlowDeck — OpenCode Plugin

> AI-powered multi-agent workflow orchestration for OpenCode

FlowDeck adds a structured, multi-agent development workflow to OpenCode. It coordinates 23 specialist agents through a four-phase cycle — discuss, plan, execute, review — with persistent state that survives session restarts.

---

## Features

- 🤖 **23 agents** — specialist agents for every phase: architect, planner, coder, reviewer, tester, debugger, and more
- 🛠️ **24 skills** — reusable workflow patterns (TDD, security scan, deploy check, code review, and more)
- ⚡ **16 commands** — slash commands covering every workflow stage
- 📋 **14 workflows** — pre-built orchestration flows for common engineering tasks
- 🔄 **Persistent state** — resume exactly where you left off across sessions via `.planning/STATE.md`
- 🔀 **Parallel execution** — independent tasks run simultaneously in wave-structured batches
- 📐 **Language rules** — coding standards for TypeScript, Python, Go, Java, and Rust
- 🗂️ **Multi-repo support** — coordinate changes across multiple repositories in one session
- 🔔 **System notifications** — desktop alerts when long-running tasks complete

---

## Quick Install

### Method 1: curl (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/flowdeck/main/install.sh | bash
```

### Method 2: npx (no git required)

```bash
npx opencode-flowdeck install
```

### Method 3: Manual

```bash
git clone https://github.com/YOUR_ORG/flowdeck
cd flowdeck
npm install && npm run build
bash install.sh
```

See [Installation](docs/installation.md) for prerequisites, verification steps, and environment variables.

---

## Core Workflow

FlowDeck structures every feature through a four-step cycle:

```
/new-project  →  /discuss  →  /plan  →  /new-feature
```

| Step | Command | What happens |
|------|---------|--------------|
| **Initialize** | `/new-project MyApp` | Creates `.planning/` directory with `PROJECT.md`, `STATE.md`, and `ROADMAP.md` |
| **Discuss** | `/discuss 1` | `@discusser` runs structured Q&A, saves decisions to `DISCUSS.md` |
| **Plan** | `/plan 1` | `@flowdeck-planner` builds a wave-structured `PLAN.md`; you type `CONFIRMED` to proceed |
| **Execute** | `/new-feature "…"` | `@orchestrator` delegates to `@architect`, `@coder`, `@tester`, `@reviewer` in waves |

State is written to `.planning/STATE.md` after each phase. Use `/checkpoint` to save mid-session and `/resume` to reload context in a new session.

---

## Documentation

| File | Description |
|------|-------------|
| [docs/index.md](docs/index.md) | Full documentation table of contents |
| [docs/installation.md](docs/installation.md) | Prerequisites, install methods, verification, and uninstall |
| [docs/quick-start.md](docs/quick-start.md) | First 15 minutes — step-by-step walkthrough |
| [docs/configuration.md](docs/configuration.md) | `opencode.json`, project config, environment variables, plugin tools |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Full agent and skill usage reference with examples |

---

## License

MIT
