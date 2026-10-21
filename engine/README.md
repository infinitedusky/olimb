# Idea Factory engine

The core: **plans are made of tasks; tasks form a dependency graph; the engine runs every task whose dependencies
are done, in parallel, each agent on its own branch.** Steps 1–3 of four (`research/parallel-engine.md` §6) are
here: the schema, the server, the event stream and the scheduler (1); one task end to end — a worktree from the
plan's integration branch, a Claude Code run through the Agent SDK, the serial landing step, one PR per plan (2);
parallel for real — several tasks under the cap, dependents after their parents land, retries, recovery after a
restart, cleanup once a plan lands (3).

Founding rule (SHAPE.md): **git holds code, Postgres holds state, this server is the single writer.** The CLI, the
UI and the VS Code view are clients; agents report events, they never write status.

## Run it

```bash
docker compose up -d          # Postgres 17 on localhost:5433
pnpm install
pnpm db:migrate               # apply drizzle/ migrations
pnpm serve                    # http://localhost:4000
```

Then, from another terminal (`pnpm if …` runs the CLI against `ENGINE_URL`, default `http://localhost:4000`):

```bash
pnpm if workspace "My workspace"            # → {"id":"ws_…"}
pnpm if app "Homework Gate" -w ws_…          # → {"id":"app_…"}
pnpm if plan create -a app_… -t "The gate, as a graph" -f examples/demo-plan.json
pnpm if plan tick plan_… -r 2               # one dispatch pass with 2 free slots
pnpm if plan graph plan_…                   # status, edges, and why each held task waits
pnpm if task status task_… done             # drive it by hand, or:
pnpm if watch -p plan_…                     # replay the plan's events, then follow live
```

To run a plan for real, the app needs a repo with a local main checkout and a test command:

```bash
pnpm if app "Homework Gate" -w ws_… --test-cmd "/abs/path/to/.venv/bin/python -m pytest -q poc" --max-budget-usd 10
pnpm if repo infinitedusky/homework-gate -a app_… -p /abs/path/to/homework-gate
pnpm if plan create -a app_… -t "Health endpoint" -f examples/homework-gate-health.json
pnpm if plan start plan_…                   # integration branch, worktree per task, agent run, landing, PR
```

Each task gets `<repo>-worktrees/<plan>--<n>` on branch `task/<plan>/<n>`, cut from `plan/<plan>` (itself cut from
the default branch). The agent works there with tools confined to the worktree (no branch changes, pushes or PRs),
commits, and summarises. Landing is serialized per plan: merge the integration branch in → run the test command on
the merged commit → fast-forward `plan/<plan>` by compare-and-swap. A failed run or landing re-queues the task with
the reason, up to three attempts. The first landing pushes `plan/<plan>` and opens the plan's PR against the default
branch via `gh`; later landings update it. When every task has landed, the task worktrees and local task branches
are removed; the integration branch stays, it is the PR. Development runs on the operator's Claude Code login; a
product deployment sets `ANTHROPIC_API_KEY`.

Up to `SESSIONS_MAX` (default 4) steps run at once **across all running plans**: one dispatch pass covers every running plan, file claims are checked across plans within an app (a step with no claims claims the whole app, never another app), and `GET /apps/:id/graph` is the top-level graph with dashed links between open steps that share a file. On startup the server recovers: runs left
`working` are marked `interrupted`, their tasks re-queued (the next run resumes the agent's session in the same
worktree), stray `claude` processes inside our worktree roots are stopped, and running plans are dispatched again.
On SIGTERM, live runs are aborted so the agents stop.

`GET /events?since=<seq>&plan=…` is the live feed (SSE): replay from a sequence number, then every committed
event as it happens, via Postgres `LISTEN/NOTIFY`. Several clients can watch one run.

## What's here

| File | Role |
| --- | --- |
| `src/db/schema.ts` | The tables, tagged `[LS]` Lightsprint-derived, `[ID]` InDusk, `[IF]` ours. Prefixed IDs (`task_…`). |
| `drizzle/` | Migrations, generated with `pnpm db:generate` after a schema change. |
| `src/scheduler.ts` | Pure: given a plan's tasks and free slots, what to start and why everything else is held. One pick at a time, so two tasks freed together never claim the same file. |
| `src/plans.ts` | The single writer's view of a plan: create (tasks, edges, file claims, in one transaction), graph, `tick` (one dispatch pass), manual status. |
| `src/events.ts` | Append an event in the same transaction as the state change; `NOTIFY` carries only the seq; readers fetch rows by seq. |
| `src/server.ts` | Hono: `/workspaces`, `/apps` (POST, GET), `/repos`, `/plans` (POST, GET), `/plans/:id/graph` (tasks, edges, claims, held reasons, last run per task, the plan's PR), `/plans/:id/start`, `/plans/:id/tick`, `/tasks/:id/status`, `/events` (SSE). |
| `src/git.ts` | Worktrees, branches, merge, fast-forward by `update-ref` compare-and-swap, push. |
| `src/executor.ts` | One Agent SDK run on one task; messages → events (trimmed); tools confined to the worktree. |
| `src/landing.ts` | Merge → test → fast-forward, serialized per plan; refuses conflicts and failing tests. |
| `src/pr.ts` | One PR per plan via `gh`, opened at the first landing, updated after each. |
| `src/runner.ts` | Start a plan, dispatch ready tasks under the cap, launch, land, retry, keep the PR current, clean up, recover. |
| `src/reap.ts` | Find and stop agent processes working inside our worktree roots (orphans after a crash). |
| `src/cli/if.ts` | The `if` CLI. A client; only `migrate` touches the database. |

`pnpm test` runs the scheduler and landing tests anywhere (landing uses a throwaway git repo) and, when the
database is up, the plan tests and the runner tests (a fake executor on a throwaway repo: the cap, dependents after
parents, retries with the reason, recovery, cleanup). The tests write to the same database the server uses.

## Next (step 4)

The VS Code graph view over `/events`: nodes from `task`, edges from `task_dependency`, colour by status, the live
run on each node, the plan's PR readiness.
