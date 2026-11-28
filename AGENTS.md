# AGENTS.md — Multi-agent operating contract (herdr)

This file is the single source of truth for EVERY AI agent working in this repository
(Claude Code, OpenCode, Codex CLI, Antigravity CLI, or any other).
Read it fully before doing anything. If an instruction elsewhere conflicts with this file,
this file wins, except for direct instructions from the human.

Keywords: MUST / MUST NOT / SHOULD / MAY have their RFC 2119 meaning.

---

## 0. Project facts (lead fills this in during Phase 0)

```yaml
project_name: ydmaster          # vocab and school-passage study web app
repo_root: C:/Users/hanse/OneDrive/Desktop/ydmaster   # working branch: master (pushed to remote main)
worktree_parent: C:/Users/hanse/OneDrive/Desktop
stack: vanilla ES modules frontend (public/, no build) + Express/Mongoose API (server/), hosted on Vercel
commands:
  install:   npm install
  dev:       PORT=$PORT node test/dev-server.js   # in-memory Mongo with seeded demo accounts
  typecheck: none (plain JS)
  lint:      none in repo; lead runs npx eslint on a scratch copy
  test:      npm test
deploy: git push origin master:main -> Vercel; verify https://ydmaster.vercel.app/api/version (H3: human approves first)
human_language: Korean          # language for every message addressed to the human
```

---

## 1. Roster

Exactly one agent per role name. Role names are also the herdr agent names.

| role name   | tool              | herdr --kind (verify, see ORCHESTRATOR §1) | cwd                         | may write code | uses herdr |
|-------------|-------------------|--------------------------------------------|-----------------------------|----------------|------------|
| `lead`      | Claude Code (Opus)| (started by the human)                     | repo_root, or its own worktree | yes         | YES (only one) |
| `worker-a`  | OpenCode          | `opencode`                                 | its assigned worktree       | yes            | NO |
| `worker-b`  | OpenCode          | `opencode`                                 | its assigned worktree       | yes            | NO |
| `reviewer`  | Codex CLI         | `codex`                                    | repo_root (read-mostly)     | NO (only `docs/reviews/**`, and tests when the task says so) | NO |
| `research`  | Antigravity CLI (`agy`), or Codex if credits allow | `antigravity-cli` / `codex` | repo_root (read-only) | NO (only `docs/research/**`) | NO |

Role cards (read the one that matches your name):
- lead → `docs/agents/ORCHESTRATOR.md`
- worker-* → `docs/agents/roles/worker.md`
- reviewer → `docs/agents/roles/reviewer.md`
- research → `docs/agents/roles/research.md`

If you do not know your role name, STOP and print: `STATUS: BLOCKED reason="role unknown"`.

---

## 2. Hard rules (all agents)

1. ONE WRITER PER WORKTREE. Only the owner of a worktree edits files in it.
2. Edit ONLY paths listed in your task's `files` field in `docs/TASKS.md`.
   Need another path → stop and emit `STATUS: NEEDS_LEAD`.
3. SHARED FILES are lead-only: `package.json`, lockfiles, DB schema and migrations,
   router/global config, `.env*`, CI config, `AGENTS.md`, `CLAUDE.md`, `docs/TASKS.md`, `docs/agents/**`.
4. MUST NOT: `git push`, deploy, delete branches, `git reset --hard` on shared branches,
   `rm -rf` outside your own worktree, edit `main` directly (lead merges only).
5. MUST NOT print, copy, or commit secret values. Use `.env.example` for names only.
6. MUST NOT answer another agent's approval/permission dialog. Only the human does.
7. Only `lead` controls herdr. Every other agent MUST NOT run `herdr` commands.
8. Do not invent facts about the codebase. Read files; when unsure, say so in your handoff.
9. Messages to the human: write in `human_language`. Files and code: English.

---

## 3. Task lifecycle (state machine)

States are stored in the `state` column of `docs/TASKS.md`. Only `lead` writes that file.

```
TODO ──assign──▶ ASSIGNED ──agent starts──▶ IN_PROGRESS
IN_PROGRESS ──STATUS: DONE──▶ IMPL_DONE ──lead sends to reviewer──▶ IN_REVIEW
IN_REVIEW ──VERDICT: APPROVE──▶ APPROVED ──lead merges + checks pass──▶ MERGED
IN_REVIEW ──VERDICT: CHANGES_REQUESTED──▶ CHANGES_REQUESTED ──lead resends to owner──▶ IN_PROGRESS
any ──STATUS: BLOCKED / NEEDS_LEAD──▶ BLOCKED ──lead or human resolves──▶ previous state
review loop count > 2 ──▶ ESCALATED (human decides)
```

---

## 4. Output protocol (machine-readable last line)

Every agent MUST end each completed turn with exactly ONE status line as the LAST line of output.
Lead parses it with `herdr agent read`. No text after it.

Workers / research:
```
STATUS: DONE task=<ID> handoff=<path>
STATUS: BLOCKED task=<ID> reason="<one line>"
STATUS: NEEDS_LEAD task=<ID> request="<one line: file/package/decision needed>"
```
Reviewer:
```
VERDICT: APPROVE task=<ID> report=<path> must_fix=0
VERDICT: CHANGES_REQUESTED task=<ID> report=<path> must_fix=<N>
```
Lead (to human, in human_language, prefixed):
```
HUMAN_GATE: <H1|H2|H3|H4> <one-line question>
```

---

## 5. Definition of Done (implementation tasks)

All MUST be true before `STATUS: DONE`:
- [ ] typecheck, lint, test commands pass in your worktree (paste the summary lines in the handoff)
- [ ] only paths in the task's `files` field changed (`git diff --name-only main...HEAD`)
- [ ] small commits, message format `<feat|fix|chore|test|docs>(<scope>): <summary> [<ID>]`
- [ ] handoff file written from `docs/agents/templates/handoff.md` at `docs/handoff/<ID>.md` and committed
- [ ] no secrets, no debug leftovers, no unrelated formatting churn

---

## 6. File map

```
AGENTS.md                         this contract (all agents)
CLAUDE.md                         lead entry point (imports this file + ORCHESTRATOR.md)
docs/PLAN.md                      design written by lead in Phase 1
docs/TASKS.md                     task board (lead-only writes)
docs/agents/ORCHESTRATOR.md       lead playbook: setup, management loop, workflow
docs/agents/roles/*.md            role cards
docs/agents/templates/*.md        handoff / review templates
docs/handoff/<ID>.md              written by task owner
docs/reviews/<ID>-r<N>.md         written by reviewer
docs/research/<topic>.md          written by research
```
