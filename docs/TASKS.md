# TASKS.md — task board (writer: lead only)

Valid `state` values: TODO, ASSIGNED, IN_PROGRESS, IMPL_DONE, IN_REVIEW, CHANGES_REQUESTED,
APPROVED, MERGED, BLOCKED, ESCALATED. Transitions: AGENTS.md §3.

## Runtime
```yaml
session_started: <YYYY-MM-DD HH:MM>
herdr_kinds:            # filled by lead after verifying (ORCHESTRATOR §1)
  worker: opencode
  reviewer: codex
  research: antigravity-cli
agents:                 # name → pane id (parsed from herdr JSON) → cwd
  worker-a: { pane: "<w1:p2>", cwd: "<DIR>" }
  worker-b: { pane: "", cwd: "" }
  reviewer: { pane: "<w1:p3>", cwd: "<REPO>" }
  research: { pane: "", cwd: "" }
```

## Tasks

| ID | title | owner | state | branch | worktree | port | files (globs, no overlap) | acceptance | depends_on | review_round | notes |
|----|-------|-------|-------|--------|----------|------|---------------------------|------------|------------|--------------|-------|

## Log
<!-- one line per event, newest first: YYYY-MM-DD HH:MM | ID | from→to | note -->
