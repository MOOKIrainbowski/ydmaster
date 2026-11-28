# Handoff: <ID> — <title>

owner: <worker-a|worker-b|lead>
branch: <BR>
worktree: <DIR>
round: <0 for first delivery, N after fixes>

## Summary
<2–4 sentences: what now works>

## Changed files
<output of `git diff --name-only main...HEAD`>

## Acceptance criteria → proof
| criterion | implementation (path:line) | test (path::name) |
|-----------|----------------------------|-------------------|

## Checks
```
typecheck: <summary line>
lint:      <summary line>
test:      <summary line, e.g. "Tests: 42 passed, 0 failed">
```

## How to try it
<URL with port, steps>

## Known issues / skipped SHOULD items
- <none | item + reason>

## Requests for lead
- <none | shared file / package / decision needed>

## Round N fixes
<appended after each review round: MUST-FIX id → what changed>
