# ORCHESTRATOR.md — Playbook for `lead` (Claude Code)

Audience: `lead` only. Follow the phases in order. Each phase lists ENTRY condition,
STEPS, EXIT condition. Never skip a HUMAN_GATE.

Variables used below (resolve from AGENTS.md §0):
`$REPO` = repo_root, `$WT` = worktree_parent, `$NAME` = project_name.

---

## 1. herdr command reference (the only herdr commands you use)

```bash
test "${HERDR_ENV:-}" = 1                         # guard; must pass before any herdr call
herdr agent list                                  # roster + states (idle|working|blocked|done)
herdr pane split --current --direction right --cwd "<abs path>" --no-focus   # returns JSON with the new pane id
herdr pane split --current --direction down  --cwd "<abs path>" --no-focus
herdr agent start <name> --kind <kind> --pane <pane-id>
herdr agent prompt <name> "<text>" --wait --timeout <ms>
herdr agent wait <name> --until <done|blocked> --timeout <ms>
herdr agent read <name> --source recent-unwrapped --lines 120
herdr agent send-keys <name> esc                  # interrupt current generation
herdr agent explain <name>                        # debug a wrong state
herdr pane run <pane-id> "<shell cmd>"            # non-agent panes (dev server, tests)
herdr pane wait-output <pane-id> --match "<regex/text>" --timeout <ms>
herdr pane read <pane-id> --source recent-unwrapped --lines 120
```

Rules for herdr usage:
- Pane ids look like `w1:p2`. ALWAYS parse them from the JSON response. NEVER derive from sidebar order.
- Use `--no-focus` for every split. Never steal the human's focus.
- Prompt an agent only when its state is `idle` or `done`. If `blocked`, do not prompt (go to §5.3).
- A timeout does NOT prove the prompt was not delivered. NEVER resend the same prompt blindly:
  first `herdr agent read` and check.
- Close only panes you created. NEVER run `herdr server stop` or kill the herdr process.
- Use `--trust-repository` only if the human explicitly said the repo is verified.
- `--kind` values: on first use run `herdr agent start --help` (or `herdr agent list` after a manual start)
  and record the exact kind identifiers in `docs/TASKS.md` → `## Runtime`. Expected: `opencode`, `codex`,
  `antigravity-cli`. If a kind is unknown, start the CLI with `herdr pane run <pane-id> "<cli>"` instead
  and refer to it by pane id.

Keep prompts SHORT. Never paste long instructions through `agent prompt`.
Put instructions in files and send a pointer (see §4 prompt formats).

---

## 2. Phase 0 — Bootstrap

ENTRY: human asked you to start the project / a feature.
STEPS:
1. Guard: `test "${HERDR_ENV:-}" = 1`.
2. `cd $REPO && git status --porcelain && git branch --show-current` → must be clean and on `main`.
   Not clean → HUMAN_GATE H0 (ask how to handle uncommitted changes). Stop.
3. Tool check: `command -v opencode codex agy git`. Record which exist.
   Missing `opencode` → workers fall back to a second Claude Code (`--kind claude`, model Sonnet) — tell the human.
   Missing `codex` → reviewer falls back to Claude Code with `/review`-style prompt — tell the human (weaker: same-vendor review).
   Missing `agy` → research uses `codex` if present, else skip the research role.
4. Fill AGENTS.md §0 (project facts) by reading package.json / README / config. Ask the human only for what you cannot determine.
5. Ensure these exist (create from this kit if missing): `docs/TASKS.md`, `docs/agents/roles/*`, `docs/agents/templates/*`,
   `docs/handoff/`, `docs/reviews/`, `docs/research/`. Ensure `.env*` is in `.gitignore`.
6. Commit on main: `chore(agents): bootstrap multi-agent docs`.
EXIT: repo clean on main, AGENTS.md §0 filled, tool availability known.

---

## 3. Phase 1 — Plan (HUMAN_GATE H1)

ENTRY: Phase 0 done. Requirement text from the human.
STEPS:
1. Read relevant code. Optionally ask `research` (start it per §4.3) for library/docs questions; wait for its STATUS.
2. Write `docs/PLAN.md`: goal, non-goals, data model, routes/screens, shared types/interfaces, risks.
3. Split into tasks in `docs/TASKS.md`. Splitting rules:
   - Split by FILE BOUNDARY, not by feature wording. Two tasks MUST NOT share any path in `files`.
   - Anything touching shared files (AGENTS.md §2.3) → a `F*` foundation task owned by `lead`.
   - Each worker task should fit ~1–3 hours of human-equivalent work and have testable acceptance criteria.
   - Max 2 worker tasks IN_PROGRESS at once (worker-a, worker-b). Others stay TODO.
   - Give each task: ID, title, owner, branch `feat/<id-lowercase>-<slug>`, worktree path, port, files, acceptance, depends_on.
4. HUMAN_GATE H1: print a Korean summary of PLAN + task table and ask for approval. STOP until the human approves.
EXIT: human approved; TASKS.md committed on main.

---

## 4. Phase 2–3 — Foundation, then provisioning

### 4.1 Foundation (lead alone)
- Implement all `F*` tasks yourself in your own worktree (branch from the task row), run all checks,
  send a REVIEW REQUEST to `reviewer` (§4.3 first), and merge to main with `--no-ff` after APPROVE (Phase 5 steps).
- Commit `docs/TASKS.md` updates. Workers MUST branch from a main that already contains foundation + TASKS.md + role cards.

### 4.2 Provision a worker (repeat per ASSIGNED worker task)
```bash
BR=feat/t2-login-ui; DIR=$WT/$NAME-t2; PORT=3001          # from the task row
git -C $REPO worktree add "$DIR" -b "$BR" main
( cd "$DIR" && <install cmd> )                             # deps per worktree
herdr pane split --current --direction right --cwd "$DIR" --no-focus   # → PANE (parse JSON)
herdr agent start worker-a --kind opencode --pane "$PANE"
herdr agent list                                           # wait until worker-a is idle (re-check, max ~60s)
herdr agent prompt worker-a "<WORKER START prompt, §4.4>" --wait --timeout 30000
```
Set task state ASSIGNED → IN_PROGRESS in TASKS.md once the worker acknowledges (its screen shows it started).

### 4.3 Provision reviewer and research (once per session, reuse after)
```bash
herdr pane split --current --direction down --cwd "$REPO" --no-focus    # → RPANE
herdr agent start reviewer --kind codex --pane "$RPANE"
# research only when needed:
herdr pane split --current --direction down --cwd "$REPO" --no-focus    # → SPANE
herdr agent start research --kind antigravity-cli --pane "$SPANE"
```
Do not prompt reviewer until a task reaches IMPL_DONE.

### 4.4 Prompt formats (send exactly these shapes; ≤ 3 lines)
```
WORKER START:
You are worker-a. Read AGENTS.md and docs/agents/roles/worker.md, then do task T2 from docs/TASKS.md. Your worktree is <DIR>, port <PORT>. End with the STATUS line.

WORKER FIX:
Task T2 review round <N> requests changes. Read <abs path to docs/reviews/T2-rN.md> and fix every MUST-FIX item only. End with the STATUS line.

WORKER ANSWER (reply to NEEDS_LEAD):
Re T2: <decision in one or two sentences, or "lead added <file/package> on main; run: git merge main">. Continue. End with the STATUS line.

REVIEW REQUEST:
You are reviewer. Read AGENTS.md and docs/agents/roles/reviewer.md. Review task T2: branch <BR>, worktree <DIR>, round <N>. Write docs/reviews/T2-r<N>.md. End with the VERDICT line.

RESEARCH REQUEST:
You are research. Read AGENTS.md and docs/agents/roles/research.md. Question: <one line>. Write docs/research/<slug>.md. End with the STATUS line.
```

### 4.5 Non-agent panes
- Dev server per worktree: split a pane with `--cwd "$DIR"`, then `herdr pane run <id> "PORT=<PORT> <dev cmd>"`.
- Checks you run yourself: `herdr pane run <id> "<test cmd>"` then `herdr pane wait-output <id> --match "<pass/fail marker>"`.

---

## 5. Phase 4 — Management loop

You are single-threaded. Run this loop between your own work steps (after each of your commits),
or whenever the human says "check agents". When you have no own work, block on `herdr agent wait`.

```
LOOP:
  herdr agent list
  for each agent in roster:
    state = its herdr state
    if state == blocked            → §5.3
    if state in (done, idle) and its task state is IN_PROGRESS or IN_REVIEW:
        out = herdr agent read <name> --source recent-unwrapped --lines 120
        line = last line matching ^(STATUS|VERDICT):
        dispatch(line)             → §5.1 / §5.2
    if state == working for > 45 min with no new commits in its worktree → read screen; if looping, send-keys esc and re-prompt with a narrower instruction; log it
  update docs/TASKS.md (state, review_round, notes) and commit on main: chore(tasks): sync
```
Waiting idle: `herdr agent wait worker-a --until done --timeout 1800000` (then still verify the STATUS line).
No STATUS line on a done/idle agent → prompt once: `Print your STATUS line for task <ID> now.` Never twice; on second miss mark BLOCKED.

### 5.1 Dispatch STATUS (workers, research)
| line | action |
|------|--------|
| `STATUS: DONE task=X handoff=P` | verify: `git -C <DIR> diff --name-only main...HEAD` ⊆ task.files AND handoff exists. Pass → IMPL_DONE → send REVIEW REQUEST. Fail → WORKER FIX with your own short list (counts as a review round). |
| `STATUS: NEEDS_LEAD task=X request=R` | decide. Shared-file change → do it yourself on main, commit, then WORKER ANSWER telling it to `git merge main`. Out-of-scope request → refuse with reason. Product decision → HUMAN_GATE H2. |
| `STATUS: BLOCKED task=X reason=R` | read screen; fix environment issue if it is yours (deps, port, missing file); else HUMAN_GATE H2. |

### 5.2 Dispatch VERDICT (reviewer)
| line | action |
|------|--------|
| `VERDICT: APPROVE ...` | APPROVED → Phase 5 merge. |
| `VERDICT: CHANGES_REQUESTED ... must_fix=N` | review_round += 1. If review_round ≤ 2 → CHANGES_REQUESTED → WORKER FIX. If > 2 → ESCALATED → HUMAN_GATE H4. |

### 5.3 Blocked agent (approval / permission / question dialog)
1. `herdr agent read <name> --source recent-unwrapped --lines 60`.
2. NEVER answer it yourself, never send `y`/enter to it.
3. HUMAN_GATE H2 in Korean: `<agent> 가 승인을 요청합니다: <what exactly, command/file>. 해당 pane에서 직접 승인/거부해 주세요.`
4. Continue other work; re-check this agent in the next loop.

---

## 6. Phase 5 — Integrate (HUMAN_GATE H3)

ENTRY: task APPROVED; all its `depends_on` are MERGED.
```bash
cd $REPO && git checkout main
git merge --no-ff <BR> -m "merge(<ID>): <title>"
<typecheck> && <lint> && <test>
```
- Checks fail → `git merge --abort` if still merging, else `git revert -m 1 HEAD`; set CHANGES_REQUESTED with the failure output summarized; WORKER FIX.
- Checks pass → MERGED. Other in-progress workers whose files are unaffected keep going; tell affected ones `git merge main` via WORKER ANSWER.
- After a batch of merges: HUMAN_GATE H3 — ask the human to push/deploy. You MUST NOT push or deploy.
- Cleanup per merged task (after the worker pane is idle): close the agent's pane you created,
  `git -C $REPO worktree remove "$DIR"`. Keep the branch.

Resume (new lead session): read TASKS.md → `herdr agent list` → for each IN_PROGRESS/IN_REVIEW row read the agent's last lines and continue from §5. Missing agent → re-provision with §4.2 using the existing worktree (skip `worktree add`).

---

## 7. HUMAN_GATE catalogue (stop and ask, in Korean)

| gate | when |
|------|------|
| H0 | repo dirty / not on main at bootstrap |
| H1 | plan + task split ready (always) |
| H2 | any approval dialog, product decision, or BLOCKED you cannot fix |
| H3 | before any push, deploy, release, or branch deletion |
| H4 | review loop exceeded 2 rounds; or you want to change the roster/tools |

## 8. Your own implementation work
- You may own tasks. Use your own worktree `$WT/$NAME-<id>` like a worker; never implement on main except merges and shared-file edits.
- Your tasks also go through `reviewer`. You do not approve your own code.
