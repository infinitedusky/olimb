/**
 * The engine server: the single writer. Everything else (CLI, UI, VS Code) talks to it over HTTP, and watches
 * the event log over SSE at GET /events.
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, pool } from './db/client.js'
import { app as appTable, PHASE_STATUSES, repo as repoTable, workspace, type PhaseStatus } from './db/schema.js'
import { EventBus, eventsSince } from './events.js'
import { newId } from './ids.js'
import { createIdea, listIdeas, planFromIdea } from './ideas.js'
import { answerPermission, closeTalks, endTalk, interruptTalk, listTalks, renameTalk, say, setAutoApprove, startTalk, talkTranscript, type SubjectRef, type TalkContext } from './talk.js'
import { describePlan } from './describe.js'
import { now } from './now.js'
import { startStorybook, stopStorybooks, storybookStatus } from './storybook.js'
import { answerQuestion, finishPlanning, preparePlanning, recoverPlanning } from './planner.js'
import { listTasks, addPhases, appGraph, clearPhases, createPlan, listPlans, PlanError, planGraph, setPhaseStatus, tick } from './plans.js'
import { runner } from './runner.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

const planError = (c: any, err: unknown, status = 400) => {
  if (err instanceof PlanError) return c.json({ error: err.message }, status)
  throw err
}

export function buildApp(bus: EventBus) {
  const api = new Hono()

  api.get('/', (c) => c.json({
    engine: 'Self Evident',
    model: 'idea → plan (tasks in order) → task (title + brief) → phase (one agent, one worktree, one commit) → step (the builder\'s todo list)',
    routes: {
      'GET /health': 'database reachable?',
      'POST /workspaces': '{name}', 'POST /apps': '{workspaceId, name, defaultBranch?, setup?}', 'POST /repos': '{appId, fullName, localPath?, baseBranch?}',
      'GET /apps': 'all apps, each with its repos', 'PATCH /apps/:id': '{name?, defaultBranch?, setup?}', 'PATCH /repos/:id': '{fullName?, localPath?, baseBranch?}', 'GET /workspaces': 'all workspaces',
      'GET /apps/:id/graph': 'the top-level graph: every phase of every plan in the app', 'GET /now': 'the front door: running, needs you, recent',
      'POST /plans': '{appId, title, spec?, tasks: [{title, brief?, phases?: [{key, title, brief?, dependsOn?, files?}]}]}',
      'GET /plans': 'all plans with counts', 'GET /plans/:id/graph': 'tasks in order, phases with edges, claims, held reasons, last run, steps, the PR',
      'POST /tasks/:id/phases': '[{key, title, brief?, dependsOn?, files?}] — add phases to a task by hand',
      'POST /tasks/:id/plan?wait=1': 'the planner: the task\'s brief → phases, decisions, questions (one read-only agent run); 202 at once, or wait',
      'POST /questions/:id/answer': '{answer}',
      'POST /plans/:id/start': 'run it: worktrees, agent runs, landing, PR', 'POST /plans/:id/tick?room=N': 'one dispatch pass for a draft (no launching)',
      'POST /phases/:id/status': '{status} — by hand, for drafts',
      'GET /events?since=SEQ&app=&plan=&task=&phase=': 'SSE: replay from SEQ, then live',
    },
    cli: 'pnpm if --help  (engine/README.md)',
  }))

  api.get('/health', async (c) => { await db.execute('select 1'); return c.json({ ok: true }) })
  api.get('/now', async (c) => { const a = c.req.query('app'); return a ? c.json({ ...(await now(a)), hold: runner.hold }) : c.json({ error: 'app is required: one app at a time' }, 400) }) // the front door: running, needs you, recent

  api.post('/workspaces', async (c) => {
    const { name } = await c.req.json<{ name: string }>()
    const [row] = await db.insert(workspace).values({ id: newId('workspace'), name }).returning()
    return c.json(row, 201)
  })

  api.get('/workspaces', async (c) => c.json(await db.select().from(workspace)))

  // Apps carry their repos; setup is the whole object (test_cmd, model, max_budget_usd, max_turns, …).
  api.get('/apps', async (c) => {
    const [apps, repos] = await Promise.all([db.select().from(appTable), db.select().from(repoTable)])
    return c.json(apps.map((a) => ({ ...a, repos: repos.filter((r) => r.appId === a.id) })))
  })
  api.patch('/apps/:id', async (c) => {
    const body = await c.req.json<{ name?: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    const [row] = await db.update(appTable).set({ ...(body.name ? { name: body.name } : {}), ...(body.defaultBranch ? { defaultBranch: body.defaultBranch } : {}), ...(body.setup ? { setup: body.setup } : {}) })
      .where(eq(appTable.id, c.req.param('id'))).returning()
    return row ? c.json(row) : c.json({ error: 'no such app' }, 404)
  })
  api.patch('/repos/:id', async (c) => {
    const body = await c.req.json<{ fullName?: string; localPath?: string | null; baseBranch?: string | null }>()
    const [row] = await db.update(repoTable).set({ ...(body.fullName !== undefined ? { fullName: body.fullName } : {}), ...(body.localPath !== undefined ? { localPath: body.localPath } : {}), ...(body.baseBranch !== undefined ? { baseBranch: body.baseBranch } : {}) })
      .where(eq(repoTable.id, c.req.param('id'))).returning()
    return row ? c.json(row) : c.json({ error: 'no such repo' }, 404)
  })
  api.post('/apps', async (c) => {
    const body = await c.req.json<{ workspaceId: string; name: string; defaultBranch?: string; setup?: Record<string, unknown> }>()
    const [row] = await db.insert(appTable).values({ id: newId('app'), workspaceId: body.workspaceId, name: body.name, defaultBranch: body.defaultBranch ?? 'main', setup: body.setup ?? {} }).returning()
    return c.json(row, 201)
  })
  api.get('/apps/:id/storybook', async (c) => { try { return c.json(await storybookStatus(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/apps/:id/storybook/start', async (c) => { try { return c.json(await startStorybook(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/apps/:id/graph', async (c) => {
    const g = await appGraph(c.req.param('id'))
    return g ? c.json(g) : c.json({ error: 'no such app' }, 404)
  })

  api.post('/repos', async (c) => {
    const body = await c.req.json<{ appId: string; fullName: string; localPath?: string; baseBranch?: string }>()
    const [row] = await db.insert(repoTable).values({ id: newId('repo'), appId: body.appId, fullName: body.fullName, localPath: body.localPath ?? null, baseBranch: body.baseBranch ?? null }).returning()
    return c.json(row, 201)
  })

  // Talk: an interactive agent session, the conversation as rows and events, permissions answered from the UI.
  api.get('/talks', async (c) => c.json(await listTalks({ open: c.req.query('open') === '1' })))
  api.post('/talks', async (c) => {
    const body = await c.req.json<{ appId?: string; subjectRef?: SubjectRef }>().catch(() => ({} as { appId?: string; subjectRef?: SubjectRef }))
    if (!body.appId) return c.json({ error: 'appId is required: a conversation belongs to an app' }, 400)
    try { return c.json(await startTalk({ appId: body.appId, subjectRef: body.subjectRef, actor: 'user' }), 201) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/rename', async (c) => {
    const { subject } = await c.req.json<{ subject: string }>()
    try { return c.json(await renameTalk(c.req.param('id'), subject)) } catch (err) { return planError(c, err, 404) }
  })
  api.get('/talks/:id', async (c) => { try { return c.json(await talkTranscript(c.req.param('id'))) } catch (err) { return planError(c, err, 404) } })
  api.post('/talks/:id/say', async (c) => {
    const { text, context } = await c.req.json<{ text: string; context?: TalkContext }>()
    try { return c.json(await say(c.req.param('id'), text, context), 202) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/permission', async (c) => {
    const { requestId, allow, always } = await c.req.json<{ requestId: string; allow: boolean; always?: boolean }>()
    try { return c.json(await answerPermission(c.req.param('id'), requestId, allow, always)) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/interrupt', async (c) => c.json(await interruptTalk(c.req.param('id'))))
  api.post('/talks/:id/auto', async (c) => { // the person's threshold: free | cheap | moderate
    const { level } = await c.req.json<{ level: 'free' | 'cheap' | 'moderate' }>()
    try { return c.json(await setAutoApprove(c.req.param('id'), level)) } catch (err) { return planError(c, err) }
  })
  api.post('/talks/:id/end', async (c) => c.json(await endTalk(c.req.param('id'))))

  // The inbox: capture an idea in a moment; make it a plan when its time comes.
  api.get('/ideas', async (c) => { const a = c.req.query('app'); return a ? c.json(await listIdeas(a)) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.post('/ideas', async (c) => {
    try { return c.json(await createIdea({ ...(await c.req.json()), actor: 'user' }), 201) } catch (err) { return planError(c, err) }
  })
  api.post('/ideas/:id/plan', async (c) => {
    const body = await c.req.json<{ tasks?: { title: string; brief?: string }[] }>().catch(() => ({} as { tasks?: { title: string; brief?: string }[] }))
    try { return c.json(await planFromIdea(c.req.param('id'), body.tasks), 201) } catch (err) { return planError(c, err) }
  })

  api.get('/tasks', async (c) => { const a = c.req.query('app'); return a ? c.json(await listTasks(a)) : c.json({ error: 'app is required: one app at a time' }, 400) })
  api.get('/plans', async (c) => { const a = c.req.query('app'); return a ? c.json(await listPlans({ all: c.req.query('all') === '1', appId: a })) : c.json({ error: 'app is required: one app at a time' }, 400) })
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
  api.delete('/tasks/:id/phases', async (c) => { // a draft task back to its brief, so it can be planned again
    try { return c.json(await clearPhases(c.req.param('id'), 'user')) } catch (err) { return planError(c, err) }
  })
  api.post('/plans/:id/describe', async (c) => { // plain descriptions for tasks and phases that have none
    try { return c.json(await describePlan(c.req.param('id'))) } catch (err) { return planError(c, err) }
  })
  api.post('/plans/:id/cancel', async (c) => {
    try { return c.json(await runner.cancelPlan(c.req.param('id'))) } catch (err) { return planError(c, err, 404) }
  })

  // The planner takes minutes: by default the request returns at once and the outcome arrives on the event stream
  // (task.planned or task.plan_failed, then the graph has the phases); ?wait=1 holds the request until it is done.
  api.post('/tasks/:id/plan', async (c) => {
    let ctx
    try { ctx = await preparePlanning(c.req.param('id'), { actor: 'user' }) } catch (err) { return planError(c, err) }
    if (c.req.query('wait') === '1') { const out = await finishPlanning(ctx); return c.json(out, out.status === 'completed' ? 200 : 500) }
    void finishPlanning(ctx)
    return c.json({ runId: ctx.runId }, 202)
  })

  api.post('/questions/:id/answer', async (c) => {
    const { answer } = await c.req.json<{ answer: string }>()
    try { return c.json(await answerQuestion(c.req.param('id'), answer, 'user')) } catch (err) { return planError(c, err, 404) }
  })

  // By-hand transitions: how a person drives a draft's graph. The executor owns running plans.
  api.post('/plans/:id/pause', async (c) => { try { return c.json(await runner.pausePlan(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.post('/plans/:id/resume', async (c) => { try { return c.json(await runner.resumePlan(c.req.param('id'))) } catch (err) { return planError(c, err) } })
  api.get('/engine', (c) => c.json({ hold: runner.hold })) // is the engine waiting for the model?
  api.post('/engine/release', async (c) => c.json(await runner.releaseHold())) // try the model now
  api.post('/phases/:id/retry', async (c) => { // a failed or cancelled phase gets three more attempts; {fresh: true} starts over from the plan's branch
    const body = await c.req.json<{ fresh?: boolean }>().catch(() => ({} as { fresh?: boolean }))
    try { return c.json(await runner.retryPhase(c.req.param('id'), { fresh: !!body.fresh })) } catch (err) { return planError(c, err) }
  })
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

  // One address: the API under /api, the built UI (app/dist) at everything else, with the SPA's index for deep
  // links. In development Vite serves the UI itself and proxies /api here.
  const root = new Hono()
  root.route('/api', api)
  const dist = resolve(fileURLToPath(import.meta.url), '../../../app/dist')
  if (existsSync(dist)) {
    const rel = relative(process.cwd(), dist) || '.'
    root.use('/assets/*', serveStatic({ root: rel }))
    root.get('*', serveStatic({ path: `${rel}/index.html` }))
  } else {
    root.get('*', (c) => c.text('The UI is not built. Run `pnpm build` at the repo root (or `pnpm dev` for Vite with live reload). The API is under /api.', 404))
  }
  return root
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) }) // idempotent; `pnpm dev` just works
  const bus = new EventBus()
  await bus.start()
  const recovered = await runner.recover()
  const stranded = await recoverPlanning()
  if (stranded) console.log(`[engine] ${stranded} planner run(s) interrupted by the restart; plan those tasks again`)
  if (recovered.plans || recovered.phases || recovered.reaped) console.log('recovered:', JSON.stringify(recovered))
  const port = Number(process.env.PORT ?? 4000)
  serve({ fetch: buildApp(bus).fetch, port }, (info) => console.log(`engine listening on http://localhost:${info.port}  (API under /api; UI at / when built)`))
  const shutdown = async () => { stopStorybooks(); closeTalks(); await runner.shutdown(); await bus.stop(); await pool.end(); process.exit(0) }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
