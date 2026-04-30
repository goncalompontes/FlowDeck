---
description: Initialize or manage multi-repo configuration for microservice architecture. Adds, lists, checks status of, or removes repos from .planning/config.json.
argument-hint: "[--add <path> <role> | --list | --status | --remove <name>]"
---

Manage the multi-repo registry in `.planning/config.json`.

**With no arguments:** show the current list of registered repos from `sub_repos`.

**Arguments:**

`--add <path> <role>` — Register a new repo. `path` is relative to the root repo's parent directory. `role` must be one of: `upstream-api`, `downstream-consumer`, `shared-lib`, `gateway`, `worker`. Prompts for `name`, `tech_stack`, and `owner_team` if not inferred.

`--list` — Print all registered repos as a table: name, path, role, tech_stack, owner_team.

`--status` — For each registered repo, check if the path resolves on disk, report the current git branch, and show whether a `.planning/` directory exists in that repo.

`--remove <name>` — Remove a repo from the registry by name. Does not delete the repo on disk.

**What this does:**

1. Reads `.planning/config.json`; creates the file with an empty `sub_repos: []` array if it does not exist
2. For `--add`: resolves the path, infers `name` from the directory name if not provided, writes the new entry to `sub_repos`
3. For `--list`: formats the `sub_repos` array as a readable table
4. For `--status`: walks each entry, checks `path` existence, runs `git -C <resolved_path> branch --show-current`
5. For `--remove`: removes the matching entry by `name`, writes back to config.json

**Example output (no args):**

```
Multi-Repo Registry (.planning/config.json)

  Name                 Path                   Role                  Stack             Team
  ───────────────────  ─────────────────────  ────────────────────  ────────────────  ────────
  user-service         ../user-service        upstream-api          node+typescript   platform
  order-service        ../order-service       downstream-consumer   node+typescript   commerce
  shared-types         ../shared-types        shared-lib            node+typescript   platform
  api-gateway          ../api-gateway         gateway               nginx+lua         infra

4 repos registered. Run /multi-repo --status to check path health.
```

**Example output (--status):**

```
Multi-Repo Status

  Name              Path               Exists   Branch            .planning/
  ────────────────  ─────────────────  ───────  ────────────────  ──────────
  user-service      ../user-service    ✅        main              ✅
  order-service     ../order-service   ✅        feature/checkout  ❌
  shared-types      ../shared-types    ✅        main              ❌
  api-gateway       ../api-gateway     ❌        —                 —

Warning: api-gateway path does not exist on disk.
Warning: order-service and shared-types have no .planning/ — cross-repo planning context unavailable.
```

**What Next?**

- `/discuss` — discuss a change that spans multiple repos before planning it
- `/new-feature` — plan and execute a feature; use with multi-repo context loaded
- `/dashboard` — view progress across all registered repos