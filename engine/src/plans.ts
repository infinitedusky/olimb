/**
 * Plans are made of tasks; tasks form the graph. This is the single writer's view of a plan: create it with its
 * tasks, dependencies and file claims in one transaction; read its graph; run one dispatch pass.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, plan, pr, run, task, taskDependency, taskFileClaim, type TaskStatus } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { claimsOverlap, findCycle, pickTasksToStart, type SchedTask } from './scheduler.js'

export interface NewTask { key: string; title: string; brief?: string; dependsOn?: string[]; files?: string[]; priority?: number }
export interface NewPlan { appId: string; title: string; spec?: string; ideaId?: string; tasks: NewTask[] }

export class PlanError extends Error {}

export async function createPlan(input: NewPlan) {
  const keys = new Set(input.tasks.map((t) => t.key))
  if (keys.size !== input.tasks.length) throw new PlanError('task keys must be unique')
  for (const t of input.tasks) for (const d of t.dependsOn ?? []) {
    if (!keys.has(d)) throw new PlanError(`task ${t.key} depends on unknown task ${d}`)
  }
  const cycle = findCycle(input.tasks.map((t) => ({ id: t.key, status: 'queued', dependsOn: t.dependsOn ?? [], files: [] })))
  if (cycle) throw new PlanError(`dependency cycle: ${cycle.join(' → ')}`)

  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(app).where(eq(app.id, input.appId))
    if (!a) throw new PlanError(`no app ${input.appId}`)
    const planId = newId('plan')
    const [p] = await tx.insert(plan).values({
      id: planId, appId: a.id, ideaId: input.ideaId ?? null, title: input.title, spec: input.spec ?? null,
      integrationBranch: `plan/${planId}`,
    }).returning()
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${task.number}), 0)` }).from(task).where(eq(task.appId, a.id))
    const idByKey = new Map(input.tasks.map((t) => [t.key, newId('task')]))
    let number = Number(max)
    const rows = input.tasks.map((t, i) => ({
      id: idByKey.get(t.key)!, appId: a.id, planId, ideaId: input.ideaId ?? null, number: ++number,
      title: t.title, brief: t.brief ?? null, priority: t.priority ?? 0, position: i,
    }))
    await tx.insert(task).values(rows)
    const deps = input.tasks.flatMap((t) => (t.dependsOn ?? []).map((d) => ({ taskId: idByKey.get(t.key)!, dependsOnTaskId: idByKey.get(d)! })))
    if (deps.length) await tx.insert(taskDependency).values(deps)
    const claims = input.tasks.flatMap((t) => (t.files ?? []).map((path) => ({ taskId: idByKey.get(t.key)!, path })))
    if (claims.length) await tx.insert(taskFileClaim).values(claims)

    const base = { workspaceId: a.workspaceId, appId: a.id, planId, actor: 'engine' }
    await appendEvent(tx, { ...base, type: 'plan.created', payload: { title: p.title, tasks: rows.length } })
    for (const r of rows) await appendEvent(tx, { ...base, taskId: r.id, type: 'task.created', payload: { number: r.number, title: r.title } })
    return { plan: p, tasks: rows }
  })
}

export async function planGraph(planId: string) {
  const [p] = await db.select().from(plan).where(eq(plan.id, planId))
  if (!p) return null
  const tasks = await db.select().from(task).where(eq(task.planId, planId)).orderBy(asc(task.position))
  const ids = tasks.map((t) => t.id)
  const deps = ids.length ? await db.select().from(taskDependency).where(inArray(taskDependency.taskId, ids)) : []
  const claims = ids.length ? await db.select().from(taskFileClaim).where(inArray(taskFileClaim.taskId, ids)) : []
  const runs = ids.length ? await db.select().from(run).where(inArray(run.taskId, ids)) : []
  const prs = ids.length ? await db.select().from(pr).where(inArray(pr.taskId, ids)) : []
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  return {
    plan: p, app: { id: a.id, name: a.name, defaultBranch: a.defaultBranch }, pr: prs[0] ?? null,
    tasks: tasks.map((t) => ({
      ...t,
      dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
      files: claims.filter((c) => c.taskId === t.id).map((c) => c.path),
      lastRun: runs.filter((r) => r.taskId === t.id).sort((a, b) => b.attempt - a.attempt)[0] ?? null,
    })),
  }
}

export type Graph = NonNullable<Awaited<ReturnType<typeof planGraph>>>

/**
 * One dispatch pass across every running plan (or one plan, for drafts and demos): the ready set is all open
 * steps, file claims are checked across plans within an app (namespaced by app, so different repos never
 * collide), and the cap is global. What can start is marked `ready`; everything else records why it waits.
 */
export async function tickAll(room: number, opts: { planId?: string } = {}) {
  return db.transaction(async (tx) => {
    const plans = opts.planId
      ? await tx.select().from(plan).where(eq(plan.id, opts.planId))
      : await tx.select().from(plan).where(eq(plan.status, 'running')).orderBy(asc(plan.createdAt))
    if (opts.planId && !plans.length) throw new PlanError(`no plan ${opts.planId}`)
    if (!plans.length) return { start: [], held: [] }
    const planIds = plans.map((p) => p.id)
    const apps = await tx.select().from(app).where(inArray(app.id, [...new Set(plans.map((p) => p.appId))]))
    const tasks = await tx.select().from(task).where(inArray(task.planId, planIds)).orderBy(asc(task.position))
    const ids = tasks.map((t) => t.id)
    const deps = ids.length ? await tx.select().from(taskDependency).where(inArray(taskDependency.taskId, ids)) : []
    const claims = ids.length ? await tx.select().from(taskFileClaim).where(inArray(taskFileClaim.taskId, ids)) : []
    const planIndex = new Map(planIds.map((id, i) => [id, i]))
    const sched: SchedTask[] = tasks.map((t) => {
      const files = claims.filter((c) => c.taskId === t.id).map((c) => `${t.appId}/${c.path}`)
      return {
        id: t.id, status: t.status as TaskStatus, dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
        files: files.length ? files : [t.appId], // no claims = claims the whole app, never another app
        priority: t.priority, position: planIndex.get(t.planId!)! * 10_000 + t.position, // older plans first
      }
    })
    const pick = pickTasksToStart(sched, room)
    const baseFor = (t: typeof tasks[number]) => {
      const a = apps.find((x) => x.id === t.appId)!
      return { workspaceId: a.workspaceId, appId: t.appId, planId: t.planId, actor: 'engine' }
    }
    for (const id of pick.start) {
      const before = tasks.find((t) => t.id === id)!
      if (before.status === 'ready') continue
      await tx.update(task).set({ status: 'ready', heldReason: null, updatedAt: new Date() }).where(eq(task.id, id))
      await appendEvent(tx, { ...baseFor(before), taskId: id, type: 'task.status', payload: { from: before.status, to: 'ready', why: 'dependencies done, files free' } })
    }
    for (const h of pick.held) {
      const before = tasks.find((t) => t.id === h.id)!
      const reason = h.reason.replace(/shares files with (\S+)/, (_, other) => `shares files with ${other}${planOf(tasks, other) !== before.planId ? ' (another plan)' : ''}`)
      if (before.heldReason === reason) continue
      await tx.update(task).set({ heldReason: reason, updatedAt: new Date() }).where(eq(task.id, h.id))
      await appendEvent(tx, { ...baseFor(before), taskId: h.id, type: 'task.held', payload: { reason } })
    }
    return pick
  })
}

const planOf = (tasks: { id: string; planId: string | null }[], id: string) => tasks.find((t) => t.id === id)?.planId

/** One dispatch pass for one plan: drafts and demos. Running plans are dispatched together by tickAll. */
export const tick = (planId: string, room: number) => tickAll(room, { planId })

/** A manual transition, for driving the graph by hand before there is an executor. */
export async function setTaskStatus(taskId: string, to: TaskStatus, actor = 'user') {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(task).where(eq(task.id, taskId))
    if (!t) throw new PlanError(`no task ${taskId}`)
    const [a] = await tx.select().from(app).where(eq(app.id, t.appId))
    await tx.update(task).set({ status: to, heldReason: null, updatedAt: new Date() }).where(eq(task.id, taskId))
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: t.appId, planId: t.planId, taskId, actor, type: 'task.status', payload: { from: t.status, to } })
    return { ...t, status: to }
  })
}

async function graphIn(tx: Tx, planId: string) {
  const [p] = await tx.select().from(plan).where(eq(plan.id, planId))
  if (!p) return null
  const [a] = await tx.select().from(app).where(eq(app.id, p.appId))
  const tasks = await tx.select().from(task).where(eq(task.planId, planId)).orderBy(asc(task.position))
  const ids = tasks.map((t) => t.id)
  const deps = ids.length ? await tx.select().from(taskDependency).where(inArray(taskDependency.taskId, ids)) : []
  const claims = ids.length ? await tx.select().from(taskFileClaim).where(inArray(taskFileClaim.taskId, ids)) : []
  return {
    plan: p, workspaceId: a.workspaceId,
    tasks: tasks.map((t) => ({
      ...t, dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
      files: claims.filter((c) => c.taskId === t.id).map((c) => c.path),
    })),
  }
}

export const _internal = { and }


/** Every plan, newest first, with its app and a count of tasks per status: the Plans page. */
export async function listPlans(opts: { all?: boolean } = {}) {
  const plans = (await db.select().from(plan).orderBy(sql`${plan.createdAt} desc`))
    .filter((p) => opts.all || p.status !== 'superseded') // tests mark their plans superseded; hide them by default
  const apps = await db.select().from(app)
  const ids = plans.map((p) => p.id)
  const tasks = ids.length ? await db.select({ planId: task.planId, status: task.status }).from(task).where(inArray(task.planId, ids)) : []
  return plans.map((p) => ({
    ...p, app: apps.find((a) => a.id === p.appId) ?? null,
    tasks: tasks.filter((t) => t.planId === p.id).reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }), {}),
  }))
}


/**
 * The top-level graph: every step of every plan in an app (superseded plans aside), with dependencies and the
 * pairs of unfinished steps that share a file (they will never run at once; drawn as dashed links).
 */
export async function appGraph(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (!a) return null
  const plans = (await db.select().from(plan).where(eq(plan.appId, appId)).orderBy(asc(plan.createdAt))).filter((p) => p.status !== 'superseded')
  const planIds = plans.map((p) => p.id)
  const tasks = planIds.length ? await db.select().from(task).where(inArray(task.planId, planIds)).orderBy(asc(task.position)) : []
  const ids = tasks.map((t) => t.id)
  const deps = ids.length ? await db.select().from(taskDependency).where(inArray(taskDependency.taskId, ids)) : []
  const claims = ids.length ? await db.select().from(taskFileClaim).where(inArray(taskFileClaim.taskId, ids)) : []
  const runs = ids.length ? await db.select().from(run).where(inArray(run.taskId, ids)) : []
  const prs = ids.length ? await db.select().from(pr).where(inArray(pr.taskId, ids)) : []
  const full = tasks.map((t) => ({
    ...t,
    dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
    files: claims.filter((c) => c.taskId === t.id).map((c) => c.path),
    lastRun: runs.filter((r) => r.taskId === t.id).sort((x, y) => y.attempt - x.attempt)[0] ?? null,
  }))
  const open = full.filter((t) => !['done', 'failed', 'cancelled'].includes(t.status))
  const conflicts: [string, string][] = []
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const x = open[i], y = open[j]
    if (x.files.length && y.files.length && x.files.some((f) => y.files.some((g) => claimsOverlap(f, g)))) conflicts.push([x.id, y.id])
  }
  return {
    app: { id: a.id, name: a.name, defaultBranch: a.defaultBranch },
    plans: plans.map((p) => ({ ...p, pr: prs.find((x) => full.some((t) => t.id === x.taskId && t.planId === p.id)) ?? null })),
    tasks: full, conflicts,
  }
}
