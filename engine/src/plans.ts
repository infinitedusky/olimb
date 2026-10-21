/**
 * Plans are made of tasks; tasks form the graph. This is the single writer's view of a plan: create it with its
 * tasks, dependencies and file claims in one transaction; read its graph; run one dispatch pass.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, plan, task, taskDependency, taskFileClaim, type TaskStatus } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { findCycle, pickTasksToStart, type SchedTask } from './scheduler.js'

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
  return {
    plan: p,
    tasks: tasks.map((t) => ({
      ...t,
      dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
      files: claims.filter((c) => c.taskId === t.id).map((c) => c.path),
    })),
  }
}

export type Graph = NonNullable<Awaited<ReturnType<typeof planGraph>>>

/**
 * One dispatch pass: run the pure scheduler over the plan's rows, mark what it would start as `ready` and record
 * why the rest are held. Step 1 has no executor, so `ready` is where tasks wait for one; step 2 consumes it.
 */
export async function tick(planId: string, room: number) {
  return db.transaction(async (tx) => {
    const g = await graphIn(tx, planId)
    if (!g) throw new PlanError(`no plan ${planId}`)
    const sched: SchedTask[] = g.tasks.map((t) => ({
      id: t.id, status: t.status as TaskStatus, dependsOn: t.dependsOn, files: t.files, priority: t.priority, position: t.position,
    }))
    const pick = pickTasksToStart(sched, room)
    const base = { workspaceId: g.workspaceId, appId: g.plan.appId, planId, actor: 'engine' }
    for (const id of pick.start) {
      const before = g.tasks.find((t) => t.id === id)!
      if (before.status === 'ready') continue
      await tx.update(task).set({ status: 'ready', heldReason: null, updatedAt: new Date() }).where(eq(task.id, id))
      await appendEvent(tx, { ...base, taskId: id, type: 'task.status', payload: { from: before.status, to: 'ready', why: 'dependencies done, files free' } })
    }
    for (const h of pick.held) {
      const before = g.tasks.find((t) => t.id === h.id)!
      if (before.heldReason === h.reason) continue
      await tx.update(task).set({ heldReason: h.reason, updatedAt: new Date() }).where(eq(task.id, h.id))
      await appendEvent(tx, { ...base, taskId: h.id, type: 'task.held', payload: { reason: h.reason } })
    }
    return pick
  })
}

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
