# The core engine: parallel execution as a task graph

Research for Idea Factory's first build, 2026-10-20. Sources: InDusk's unbuilt `run-the-graph` plan and its
session/worktree/run-record code (read-only study), a public survey of open-source parallel agent runners and
graph engines, and Lightsprint's public docs and open-source plugins (data model, section 5). Rule: borrow where
the licence allows; write only what nobody ships.

## 1. The short version

- **Nobody ships "task graph + parallel worktrees + PRs" as one unit.** Every open-source runner is a flat list or
  a parent/child tree. The only dependency-gated schedulers are Beads (Go, an issue tracker) and Claude Code's agent
  teams (not programmable). This is open ground.
- **InDusk designed the graph four times and never built it.** The design is sound and small; the scheduler code
  doesn't exist. The executor underneath (session manager, run records) does, and is worth lifting.
- **Why InDusk's build failed: task status lived in versioned files**, so every finishing agent merged its status
  into the same document ("two phases appending to one shared doc conflicted every time"). The retrofit to a
  database stalled. **Founding rule here: git holds code, Postgres holds state, one engine server is the single
  writer** (SHAPE.md).
- **Merge is the measured risk:** cross-agent PRs conflict 42% vs 20% same-agent (arXiv 2607.04697, 142k agent
  PRs); LLM conflict resolution is ~50/50 on real conflicts. Factory and Cognition both landed on "writes stay
  single-threaded". So: parallel *work*, serial *landing*.

## 2. From InDusk (`/Users/the_dusky/code/sandbox/dusk`)

**The `run-the-graph` design** (`.indusk/planning/run-the-graph/{brief,adr}.md`, accepted 2026-10-19, never built;
`src/lib/graph/` doesn't exist):
- Nodes are tasks (their "phases"). Each declares **Depends on** and **Files** (globs). Two tasks that share a
  file never run together — the only conflict protection designed. No files line = "shares with everyone" = runs
  alone. Unknown names and cycles stop the run.
- **One pure scheduler function** `pickPhasesToStart({graph, running, stopped, waitingOn, room})`: no clock, no
  reads, picks one at a time so two tasks freed together never claim the same file, and gives a reason for every
  task held back (dependency, shared file, cap, question, blocker).
- **One launch pass per plan at a time**; a task ending, a join finishing or a 30 s tick only *requests* a pass.
- **One worktree and branch per task** (`phase/<plan>/build-<n>`), cut from the plan's branch. **Join:** merge the
  plan's branch into the task → run tests on the merged commit → `--ff-only` into the plan's branch, retrying if it
  moved. Three failures stop the task; dependents wait; the rest continue.
- Results: an append-only event log (`run-started`, `launched`, `ended`, `join`, `stopped`) — the right shape, in
  the wrong place (a file). Here it's a table.

**Lift nearly as-is** (`apps/indusk-mcp/src/lib/`): `session/protocol.ts` (stream-json → typed events),
`start.ts`, `permissions.ts` (allow inside worktree roots, refuse outside; refuse AskUserQuestion when
unattended), `trust.ts`, `rate-limit.ts` (429 → 15/45/90 s); `run-record/record.ts` + `liveness.ts` (running only
if *its own* `claude` pid is alive and matches); `process-identity.ts`; the VS Code extension's reader/webview shape.
**Adapt:** `session/manager.ts` (rekey plan→(run, task); persist events to the DB instead of memory);
`createPlanWorktree` → `createTaskWorktree`. **Drop:** workbench worktree files, gate hooks, `impl.md` section-merge,
Dawn, build-admission rules.

**What actually went wrong** (git log and `.claude/lessons/`): design churn (49 commits in four days, two cold
reads each finding "twenty-odd problems"); two processes each holding a SessionManager, so a task could launch
twice; the runner racing its own timer; cap holes across plans; orphan daemons. All of it is state and ownership,
not graph theory — and all of it is what "one server, one database, pure scheduler" removes.

## 3. From open source (licences checked 2026-10-20)

| What | Pick | Why |
|---|---|---|
| Executor | **`@anthropic-ai/claude-agent-sdk`** (same binary as `claude -p`; Anthropic commercial terms, users bring their own key) | Typed `SDKMessage` stream, `resume`, `forkSession`, `canUseTool`, `maxBudgetUsd`, cost per run, `worktree_resume_refused`. `-p` only for non-TS hosts |
| Scheduler | **Write it (~300 lines)**; copy p-graph's ready-set loop (MIT, archived), `p-limit` for the cap, `dependency-graph` for cycle detection | Graph engines (LangGraph, Temporal, Mastra, Inngest, Trigger.dev) assume they can checkpoint *inside* a step; ours are opaque 5–60 min processes, so resume is "re-spawn or `--resume <session>`" regardless. Steal LangGraph's `retryPolicy` shape, Dagster's event-log-as-truth, Symphony's run-phase vocabulary |
| Worktrees/git | Ideas from Vibe Kanban's `worktree-manager` and `git` crates (Apache-2.0, Rust) | Claude Code's `--worktree` can't take an arbitrary base branch; we create worktrees ourselves and pass `cwd` |
| Landing | `git rebase` → **mergiraf** (GPL, subprocess) → a fresh agent with both diffs and both intents → park for a human; `git merge-tree` dry-run before dispatch | Tiers by cost; the LLM tier is a coin flip, so it's third |
| PRs | `gh` (shell-out): GitHub **native stacked PRs** (GA 2026-10-06) + merge queue / `gh pr merge --auto` | A plan's tasks publish as one stack |
| VS Code view | Webview + **`@xyflow/react` 12 + `@dagrejs/dagre`** (both MIT); state host-side, snapshot replay on reopen | Nx Console's architecture; re-layout only on topology change |
| Ideas to borrow | Symphony (config keys, stall timeout), Gas Town/Beads (`ready` = no open blockers; Bors-style merge queue), SuperPlane (verify gates loop back to the agent), agent teams (task JSON: a pending task with unresolved dependencies can't be claimed) | — |
| Ignore | Crystal (deprecated), Claude Squad (AGPL), Conductor (proprietary), heavy orchestration servers | — |

**Terms** (Anthropic legal page, verbatim): products "including those using the Agent SDK, should use API key
authentication"; "Anthropic does not permit… routing requests through Free, Pro, or Max plan credentials on behalf
of their users." Our development on a subscription is ordinary individual use; the product never touches
subscription credentials.

## 4. Design decisions

1. **Git holds code and authored inputs; Postgres holds all state; the engine is one server process and the
   single writer.** Agents emit events; they never write status. Clients (CLI, VS Code, UI) talk to the server
   over HTTP and a live stream (`LISTEN/NOTIFY` on the event table → WebSocket/SSE). Same code local and hosted.
2. **Plans are made of tasks; tasks form the graph.** A task declares `depends_on` and `files`. The scheduler is a
   pure function over DB rows; one dispatch pass per plan at a time; every held task carries a reason.
3. **Parallel work, serial landing.** Per-plan integration branch. A ready task's worktree branches from it *at
   dispatch*. A single in-process landing step rebases and fast-forwards finished tasks one at a time
   (merge → test → ff, three attempts). **Dependents dispatch only after their parents land** — a stack by
   construction. File claims plus a `merge-tree` dry-run gate dispatch.
4. **Executor = Agent SDK**, wrapped: spawn in the task's worktree with `cwd`, normalise `SDKMessage` to our
   events, `--resume` the session after a crash, permissions confined to the worktree, budget cap per task.
5. **Resume = re-spawn.** The event log and task rows are the truth; on restart the server reaps orphans (pid +
   program + start time), marks their tasks `interrupted`, and the scheduler picks up.
6. **The VS Code view is a client**, reading the same stream as everyone else.

## 5. Data model

*Pending: reconstruction of Lightsprint's entity model from its public docs and open-source task-sync plugin and
n8n node, to design the Postgres schema against it before writing engine code. Filled in below when it lands.*

## 6. Build order (the loop first, the middle in its simplest form)

1. **Schema and server skeleton:** Postgres, migrations, the event table, `LISTEN/NOTIFY` → SSE, a CLI that talks
   to it. No agents yet. A plan with tasks and dependencies as rows; the scheduler as a pure function with tests.
2. **One task end to end:** worktree from the integration branch, Agent SDK run, events in the table, the landing
   step, a PR via `gh`.
3. **Parallel:** the cap, file claims, dependents after landing, orphan reaping, resume. Run it on Homework Gate
   with a plan of three independent tasks and one dependent.
4. **The VS Code graph view** over the live stream.
5. **Then** telemetry in (PostHog → ideas with baselines), verification skills (screenshots on the PR), plans as
   decision cards, sandboxes and previews.

## Sources

InDusk: `.indusk/planning/run-the-graph/`, `apps/indusk-mcp/src/lib/{session,run-record,worktree}/`,
`apps/vscode-extension/`, `.claude/lessons/`. Claude Code docs: agent-sdk/overview, agent-sdk/typescript,
headless, worktrees, workflows, agent-teams, legal-and-compliance (code.claude.com/docs/en/…). Runners:
github.com/BloopAI/vibe-kanban, OpenHands/OpenHands, langchain-ai/open-swe, superplanehq/superplane,
ColeMurray/background-agents, openai/symphony, gastownhall/gastown, steveyegge/beads. Engines:
langchain-ai/langgraphjs, mastra-ai/mastra, microsoft/p-graph, sindresorhus/p-limit. Viz: reactflow.dev/learn/layouting,
dagster.io/blog/scaling-dag-visualization, github.com/nrwl/nx-console. Merge: github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available,
arxiv.org/abs/2607.04697, arxiv.org/abs/2604.03551, factory.com/news/missions, cognition.com/blog/multi-agents-working,
mergiraf.org.
