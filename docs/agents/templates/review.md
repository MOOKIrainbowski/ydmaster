# Review: <ID> round <N>

branch: <BR>
reviewer: reviewer (Codex CLI)
verdict: <APPROVE | CHANGES_REQUESTED>
must_fix: <count>

## Checks run
```
typecheck: <summary>
lint:      <summary>
test:      <summary>
```

## Scope check
<OK | list of out-of-scope paths>

## Acceptance criteria
| criterion | status (PROVEN / NOT PROVEN / FAILS) | evidence |
|-----------|--------------------------------------|----------|

## Previous round items (round ≥ 2)
| id | resolved? | note |
|----|-----------|------|

## Findings
Format per item:
- **MF-1 [MUST-FIX]** `path:line` — problem. Why it matters. Suggested fix.
- **S-1 [SHOULD]** `path:line` — problem. Suggested fix.
