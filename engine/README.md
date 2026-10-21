# Idea Factory engine

The core: **plans are made of tasks; tasks form a dependency graph; the engine runs every task whose dependencies
are done, in parallel, each agent on its own branch.** This is step 1 of four (`research/parallel-engine.md` §6):
the schema, the server, the event stream and the scheduler. No agents run yet; step 2 adds the executor.

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
pnpm if task status task_… done             # drive it by hand until there's an executor
pnpm if watch -p plan_…                     # replay the plan's events, then follow live
```

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
| `src/server.ts` | Hono: `/workspaces`, `/apps`, `/plans`, `/plans/:id/graph`, `/plans/:id/tick`, `/tasks/:id/status`, `/events` (SSE). |
| `src/cli/if.ts` | The `if` CLI. A client; only `migrate` touches the database. |

`pnpm test` runs the scheduler's unit tests anywhere and the Postgres-backed plan tests when the database is up.

## Next (step 2)

One task end to end: a worktree from the plan's integration branch, an Agent SDK run with events landing in
`event`, the serial landing step (merge → test → fast-forward), a PR via `gh`. Then step 3, parallel for real;
step 4, the VS Code graph view over `/events`.
