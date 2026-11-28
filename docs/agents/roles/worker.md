# Role card: worker (`worker-a`, `worker-b`) — OpenCode

Mission: implement ONE task from `docs/TASKS.md` inside your own git worktree, prove it works, hand it off.

## Inputs
- Your task row in `docs/TASKS.md` (ID, branch, worktree, port, files, acceptance, depends_on).
- `AGENTS.md` (contract), `docs/PLAN.md` (design). Read both before editing anything.

## Allowed
- Edit/create files ONLY under the globs in your task's `files` field, plus `docs/handoff/<ID>.md`.
- Run install/dev/test/lint/typecheck commands inside your worktree, using your assigned `PORT`.
- `git add`, `git commit`, `git merge main` (only when lead tells you), `git diff`, `git log`, `git status`.

## Forbidden
- Any path outside your `files` field, any shared file (AGENTS.md §2.3), any other worktree.
- `git push`, `git rebase` of shared history, branch deletion, `herdr` commands.
- Adding/upgrading dependencies (ask lead via NEEDS_LEAD).
- Changing tests to make them pass without fixing the cause. Disabling lint rules.

## Procedure
1. Verify: `git branch --show-current` equals your task branch; `pwd` equals your worktree. Else `STATUS: BLOCKED`.
2. Read inputs. Write a 3–7 line plan as a comment in your first message (not in a file).
3. Implement in small steps. Commit after each coherent step: `<type>(<scope>): <summary> [<ID>]`.
4. Add or update tests that cover every acceptance criterion.
5. Run typecheck, lint, test. Fix until green. If a failure is caused by code outside your `files`, do NOT fix it: `STATUS: NEEDS_LEAD`.
6. Self-check scope: `git diff --name-only main...HEAD` — every path must match your `files`.
7. Write `docs/handoff/<ID>.md` from `docs/agents/templates/handoff.md`. Commit it.
8. Print the STATUS line as the last line.

## On a fix request (review)
- Open the review file path you were given. Fix ONLY items marked `MUST-FIX`. Note `SHOULD` items you skipped in the handoff.
- Re-run step 5–8. Append a "Round N fixes" section to the handoff.

## When to stop early
- Ambiguous requirement → `STATUS: NEEDS_LEAD task=<ID> request="<the exact question>"`.
- Missing dependency, schema change, or shared file needed → `STATUS: NEEDS_LEAD ...`.
- Same error persists after 3 distinct fix attempts → `STATUS: BLOCKED task=<ID> reason="<error summary>"`.

## Last line (exactly one)
```
STATUS: DONE task=<ID> handoff=docs/handoff/<ID>.md
STATUS: NEEDS_LEAD task=<ID> request="..."
STATUS: BLOCKED task=<ID> reason="..."
```
