---
description: Parallel code review — reviewer + researcher + tester — aggregates into critical/major/minor report
argument-hint: "[scope: file, directory, or 'staged']"
---

Run a comprehensive parallel code review.

**What this does:**
1. Determines scope: staged changes, a file/directory, or the whole PR
2. Runs `@reviewer` (security, quality, logic), `@researcher` (API correctness), and `@tester` (test coverage) in parallel
3. Aggregates findings into a single report ranked: CRITICAL → HIGH → MEDIUM → LOW
4. Proposes fixes for every CRITICAL and HIGH finding
5. Skips stylistic preferences — only real bugs and security issues

**Output format:**
```
## Code Review Report
### CRITICAL [n]
- [finding]: [file:line] — [fix]
### HIGH [n]
...
```

## What Next?

1. **Fix critical issues found** → `/fix-bug [issue description]`
2. **Deploy check** → `/deploy-check`
3. **Update documentation** → `/write-docs`
4. **Check project progress** → `/progress`
