/**
 * The engine server: the single writer. Everything else (CLI, UI, VS Code) talks to it over HTTP, and watches
 * the event log over SSE at GET /events.
 */
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db, pool } from './db/client.js'
import { app as appTable, PHASE_STATUSES, repo as repoTable, workspace, type PhaseStatus } from './db/schema.js'
import { EventBus, eventsSince } from './events.js'
import { newId } from './ids.js'
import { addPhases, appGraph, createPlan, listPlans, PlanError, planGraph, setPhaseStatus, tick } from './plans.js'
import { runner } from './runner.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

const planError = (c: any, err: unknown, status = 400) => {
  if (err instanceof PlanError) return c.json({ error: err.message }, status)
  throw err
}

export function buildApp(bus: EventBus) {
  const api = new Hono()

  api.get('/', (c) => c.json({
    engine: 'Idea Factory',
    model: 'idea → plan (tasks in order) → task (title + brief) → phase (one agent, one worktree, one commit) → step (the builder\'s todo list)',
    routes: {
      'GET /health': 'database reachable?',
      'POST /workspaces': '{name}', 'POST /apps': '{workspaceId, name, defaultBranch?, setup?}', 'POST /repos': '{appId, fullName, localPath?, baseBranch?}',
      'GET /apps': 'all apps', 'GET /apps/:id/graph': 'the top-level graph: every phase of every plan in the app',
      'POST /plans': '{appId, title, spec?, tasks: [{title, brief?, phases?: [{key, title, brief?, dependsOn?, files?}]}]}',
      'GET /plans': 'all plans with counts', 'GET /plans/:id/graph': 'tasks in order, phases with edges, claims, held reasons, last run, steps, the PR',
      'POST /tasks/:id/phases': '[{key, title, brief?, dependsOn?, files?}] — add phases to a task (the planner, or a person)',
      'POST /plans/:id/start': 'run it: worktrees, agent runs, landing, PR', 'POST /plans/:id/tick?room=N': 'one dispatch pass for a draft (no launching)',
      'POST /phases/:id/status': '{status} — by hand, for drafts',
      'GET /events?since=SEQ&app=&plan=&task=&phase=': 'SSE: replay from SEQ, then live',
    },
    cli: 'pnpm if --help  (engine/README.md)',
  }))

  api.get('/health', async (c) => { await db.execute('select 1'); return c.json({ ok: true }) })

  api.post('/workspaces', async (c) => {
    const { name } = await c.req.json<{ name: string }>()
    const [row] = await db.insert(workspace).values({ id: newId('workspace'), name }).returning()
    return c.json(row, 201)
  })

  api.get('/apps', async (c) => c.json(await db.select().from(appTable)))
  api.post('/apps', async (c) => {
    const body = await c.req.json<{ workspaceId: string; name: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    const [row] = await db.insert(appTable).values({ id: newId('app'), workspaceId: body.workspaceId, name: body.name, defaultBranch: body.defaultBranch ?? 'main', setup: body.setup ?? {} }).returning()
    return c.json(row, 201)
  })
  api.get('/apps/:id/graph', async (c) => {
    const g = await appGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such app' }, 404)
  })

  api.post('/repos', async (c) => {
    const body = await c.req.json<{ appId: string; fullName: string; localPath?: string; baseBranch?: string }>()
    const [row] = await db.insert(repoTable).values({ id: newId('repo'), appId: body.appId, fullName: body.fullName, localPath: body.localPath ?? null, baseBranch: body.baseBranch ?? null }).returning()
    return c.json(row, 201)
  })

  api.get('/plans', async (c) => c.json(await listPlans({ all: c.req.query('all') === '1' })))
  api.post('/plans', async (c) => {
    try { return c.json(await createPlan(await c.req.json()), 201) } catch (err) { return planError(c, err) }
  })
  api.get('/plans/:id/graph', async (c) => {
    const g = await planGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such plan' }, 404)
  })
  api.post('/plans/:id/start', async (c) => {
    try { return c.json(await runner.startPlan(c.req.param('id'))) } catch (err) { return planError(c, err) }
  })
  api.post('/plans/:id/tick', async (c) => {
    const room = Number(c.req.query('room') ?? SESSIONS_MAX)
    try { return c.json(await tick(c.req.param('id'), room)) } catch (err) { return planError(c, err, 404) }
  })

  api.post('/tasks/:id/phases', async (c) => {
    try { return c.json(await addPhases(c.req.param('id'), await c.req.json(), 'user'), 201) } catch (err) { return planError(c, err) }
  })

  // By-hand transitions: how a person drives a draft's graph. The executor owns running plans.
  api.post('/phases/:id/status', async (c) => {
    const { status } = await c.req.json<{ status: PhaseStatus }>()
    if (!PHASE_STATUSES.includes(status)) return c.json({ error: `status must be one of ${PHASE_STATUSES.join(', ')}` }, 400)
    try { return c.json(await setPhaseStatus(c.req.param('id'), status)) } catch (err) { return planError(c, err, 404) }
  })

  // The live feed: replay from ?since=<seq>, then stream as events are committed.
  api.get('/events', (c) => {
    const since = Number(c.req.query('since') ?? 0)
    const filter = { workspaceId: c.req.query('workspace'), appId: c.req.query('app'), planId: c.req.query('plan'), taskId: c.req.query('task'), phaseId: c.req.query('phase') }
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
  if (recovered.plans || recovered.phases || recovered.reaped) console.log('recovered:', JSON.stringify(recovered))
  const port = Number(process.env.PORT ?? 4000)
  serve({ fetch: buildApp(bus).fetch, port }, (info) => console.log(`engine listening on http://localhost:${info.port}`))
  const shutdown = async () => { await runner.shutdown(); await bus.stop(); await pool.end(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
