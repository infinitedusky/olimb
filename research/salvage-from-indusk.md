# What to salvage from InDusk

Inventory of `/Users/the_dusky/code/sandbox/dusk` (2026-10-20). LOC exclude tests.
Coupling: none / light (a few plan fields to cut) / heavy (built around the plan lifecycle).

## Keep, close to as is (~9–10k LOC)

- **Wrapping an app in telemetry** — `apps/indusk-mcp/templates/`: browser OTel (`instrumentation.web.ts`, fetch/XHR/interaction, trace propagation allowlist), Node/Next/Python setup, logger, filtering exporter, `telemetry-settings.ts` (tags test runs `indusk.run=test` — the way to keep demo/fake traffic out of baselines). ~1k. No coupling.
- **Scaffold engine** — `src/lib/scaffold/` (711): writes managed files into a user's repo, never overwrites a user's edit (writes `.indusk-new` beside it).
- **Local telemetry daemon** — `src/lib/telemetry/` (4.3k) + CLI + MCP tools (`tail_logs`, spans, traces for agents) + `packages/telemetry-binaries-*` (Jaeger + otelcol, platform-split). Light coupling. Note: collector is logs-only, no metrics pipeline — a baseline will want metrics.
- **Own server on Fly** — `src/lib/server/` (774, deploy/connect, secrets by name), `src/lib/always-on/` (785, the server's watch pass, Slack, heartbeat that reports "watcher blind"), image `templates/server/Dockerfile` + `fly.toml`.
- **Reading signals from Jaeger** — `src/lib/promises/` `telemetry.ts`, `sources.ts` (local vs production), `probe.ts`, `timeline.ts`, `store.ts`, `mark.ts`, `clause-signal.ts` (~2k).
- **Admin daemon lifecycle** — `src/lib/admin/daemon.ts` (~500).
- **Demo app** — `examples/seat-holds/` (551): small app with a promise, a fault switch, Fly deploy — a reference for "real app + demo data".

## Adapt (~10k LOC)

- **Signal helper** `templates/signal.ts`/`.py` → per-idea/hypothesis measures (value + bound).
- **Promises → ideas/hypotheses**: registry, standing (held/broken over 30 days), health, incidents, watch (~3–4k) — strip the plan write-backs.
- **Session manager** — `src/lib/session/` (1.3k): spawns `claude -p` with stream-json, answers permission and AskUserQuestion, caps sessions per machine, survives crashes, replays events. Rekey from plan+kind to idea/chunk. Core of an in-house factory if not rented.
- **Worktrees** — `src/lib/worktree/` `repos.ts`, `layout.ts`, `sync.ts`: one worktree per chunk.
- **Questions with a recommendation and a cost** — `src/lib/questions/` (847) + `ask_decision` + DecisionCard UI: the "agent asks the person" model; drop the plan cost rules.
- **Run records** — `src/lib/run-record/record.ts`, liveness (~600): a run with no live process is never shown as in progress.
- **Looks slice** — DTCG foundation, mockup hashing, approvals bound to a content hash, and `browser.ts`/`dev-server.ts`/`served.ts` (start an app, screenshot per device) — useful for demonstrations (~1.5k).
- **Background reviewer** — `src/lib/eval/` `claude-run.ts`, `persistent-evaluator.ts`, `limits.ts` (~1k).
- **Admin UI** — generic primitives (Badge, Table, Stat, Timeline, Message, PromptBox, Shell…), tokens + Tailwind v4, promise timeline/health views (base for per-idea dashboards), session panel (live agent stream + reply). Lift component by component; the admin imports plan modules throughout.

## Drop (~60k LOC including hooks and skills)

Plans and lifecycle, test trajectories, gates and rituals (audit, falsify, cleanup, verify, shape), all hooks (check-gates, validate-impl-structure, plan-write-guard…), most skills (planner, work, audit, falsify, cleanup, retrospective, handoff, catchup…), plan CLI and MCP tools, the new-project brief flow, lessons and context tiers, `current.md` agent presence, phase timing, the promise confirm/contract/clause-proof layer.

## What does not exist yet

- A **baseline**: nothing compares a window before and after a change.
- **Hypothesis records** (the promise registry is the nearest thing).
- **Preview environments with fake data** (seat-holds and the looks browser pieces are the nearest start).
