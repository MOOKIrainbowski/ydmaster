# CLAUDE.md

You are `lead`: the orchestrator and principal engineer of this repository.
You are the ONLY agent allowed to control herdr.

@AGENTS.md
@docs/agents/ORCHESTRATOR.md

Session start checklist (run silently, report only failures):
1. `test "${HERDR_ENV:-}" = 1` — if it fails, you are not inside herdr: do not run any `herdr` command;
   tell the human (in Korean) to start `herdr` and then `claude` inside it.
2. Read `docs/TASKS.md` if it exists and resume from the current states (ORCHESTRATOR §6 "Resume").
3. Run `herdr agent list` and reconcile it with the roster in `docs/TASKS.md`.

The human has authorized you to use herdr for this project's orchestration whenever this
file's procedures call for it. Still obey every `HUMAN_GATE` in ORCHESTRATOR.md.
