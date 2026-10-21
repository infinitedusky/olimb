/**
 * The engine server: the single writer. Everything else (CLI, UI, VS Code) talks to it over HTTP, and watches
 * the event log over SSE at GET /events.
 */
import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db, pool } from './db/client.js'
import { app as appTable, repo as repoTable, TASK_STATUSES, workspace, type TaskStatus } from './db/schema.js'
import { EventBus, eventsSince } from './events.js'
import { newId } from './ids.js'
import { appGraph, createPlan, listPlans, PlanError, planGraph, setTaskStatus, tick } from './plans.js'
import { runner } from './runner.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

export function buildApp(bus: EventBus) {
  const api = new Hono()

  api.get('/', (c) => c.json({
    engine: 'Idea Factory', step: '3 of 4: parallel under the cap, dependents after landing, restart recovery, cleanup',
    routes: {
      'GET /health': 'database reachable?',
      'POST /workspaces': '{name}', 'POST /apps': '{workspaceId, name, defaultBranch?}',
      'POST /plans': '{appId, title, tasks: [{key, title, brief?, dependsOn?, files?, priority?}]}',
      'GET /apps': 'all apps', 'GET /apps/:id/graph': 'the top-level graph: every step of every plan in the app', 'GET /plans': 'all plans with task counts',
      'GET /plans/:id/graph': 'tasks, edges, claims, held reasons, last run per task, the plan PR', 'POST /plans/:id/tick?room=N': 'one dispatch pass (no launching)',
      'POST /repos': '{appId, fullName, localPath?, baseBranch?}', 'POST /plans/:id/start': 'run it: worktrees, agent runs, landing, PR',
      'POST /tasks/:id/status': '{status} — manual, until step 2 brings the executor',
      'GET /events?since=SEQ&plan=ID': 'SSE: replay from SEQ, then live',
    },
    cli: 'pnpm if --help  (engine/README.md)',
  }))

  api.get('/health', async (c) => {
    await db.execute('select 1')
    return c.json({ ok: true })
  })

  api.post('/workspaces', async (c) => {
    const { name } = await c.req.json<{ name: string }>()
    const [row] = await db.insert(workspace).values({ id: newId('workspace'), name }).returning()
    return c.json(row, 201)
  })

  api.post('/apps', async (c) => {
    const body = await c.req.json<{ workspaceId: string; name: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    const [row] = await db.insert(appTable).values({
      id: newId('app'), workspaceId: body.workspaceId, name: body.name, defaultBranch: body.defaultBranch ?? 'main', setup: body.setup ?? {},
    }).returning()
    return c.json(row, 201)
  })

  api.post('/repos', async (c) => {
    const body = await c.req.json<{ appId: string; fullName: string; localPath?: string; baseBranch?: string }>()
    const [row] = await db.insert(repoTable).values({
      id: newId('repo'), appId: body.appId, fullName: body.fullName, localPath: body.localPath ?? null, baseBranch: body.baseBranch ?? null,
    }).returning()
    return c.json(row, 201)
  })

  // Start running a plan: integration branch, then dispatch ready tasks into worktrees and agent runs.
  api.post('/plans/:id/start', async (c) => {
    try {
      return c.json(await runner.startPlan(c.req.param('id')))
    } catch (err) {
      if (err instanceof PlanError) return c.json({ error: err.message }, 400)
      throw err
    }
  })

  api.post('/plans', async (c) => {
    try {
      return c.json(await createPlan(await c.req.json()), 201)
    } catch (err) {
      if (err instanceof PlanError) return c.json({ error: err.message }, 400)
      throw err
    }
  })

  api.get('/apps', async (c) => c.json(await db.select().from(appTable)))
  // The top-level graph: every step of every plan in an app, with dependencies and shared-file links.
  api.get('/apps/:id/graph', async (c) => {
    const g = await appGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such app' }, 404)
  })
  api.get('/plans', async (c) => c.json(await listPlans({ all: c.req.query('all') === '1' })))

  api.get('/plans/:id/graph', async (c) => {
    const g = await planGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such plan' }, 404)
  })

  api.post('/plans/:id/tick', async (c) => {
    const room = Number(c.req.query('room') ?? SESSIONS_MAX)
    try {
      return c.json(await tick(c.req.param('id'), room))
    } catch (err) {
      if (err instanceof PlanError) return c.json({ error: err.message }, 404)
      throw err
    }
  })

  // Manual transitions: how a person drives the graph before there is an executor (step 2 replaces this).
  api.post('/tasks/:id/status', async (c) => {
    const { status } = await c.req.json<{ status: TaskStatus }>()
    if (!TASK_STATUSES.includes(status)) return c.json({ error: `status must be one of ${TASK_STATUSES.join(', ')}` }, 400)
    try {
      return c.json(await setTaskStatus(c.req.param('id'), status))
    } catch (err) {
      if (err instanceof PlanError) return c.json({ error: err.message }, 404)
      throw err
    }
  })

  // The live feed: replay from ?since=<seq>, then stream as events are committed.
  api.get('/events', (c) => {
    const since = Number(c.req.query('since') ?? 0)
    const filter = { workspaceId: c.req.query('workspace'), appId: c.req.query('app'), planId: c.req.query('plan'), taskId: c.req.query('task') }
    return streamSSE(c, async (stream) => {
      let last = since
      let sending: Promise<void> = Promise.resolve()
      const send = () => (sending = sending.then(async () => {
        for (const row of await eventsSince(last, filter)) {
          await stream.writeSSE({ id: String(row.seq), event: row.type, data: JSON.stringify(row) })
          last = row.seq
        }
      }))
      bus.on('event', send)
      let open = true
      stream.onAbort(() => { open = false; bus.off('event', send) })
      await send()
      while (open) {
        await stream.sleep(15000)
        if (open) await stream.writeSSE({ event: 'ping', data: String(Date.now()) })
      }
    })
  })

  return api
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const bus = new EventBus()
  await bus.start()
  const recovered = await runner.recover()
  if (recovered.plans || recovered.tasks || recovered.reaped) console.log('recovered:', JSON.stringify(recovered))
  const port = Number(process.env.PORT ?? 4000)
  serve({ fetch: buildApp(bus).fetch, port }, (info) => console.log(`engine listening on http://localhost:${info.port}`))
  const shutdown = async () => { await runner.shutdown(); await bus.stop(); await pool.end(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export const _unused = eq
