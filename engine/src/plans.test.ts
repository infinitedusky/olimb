/**
 * Plans, the dispatch pass and the event log, against a real Postgres (DATABASE_URL; `docker compose up -d`).
 * Skipped when the database isn't reachable, so `pnpm test` still runs the pure tests anywhere.
 */
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, workspace } from './db/schema.js'
import { createPlan, PlanError, planGraph, setTaskStatus, tick } from './plans.js'
import { newId } from './ids.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('plans in Postgres', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'test app' })
  })
  afterAll(async () => { await pool.end() })

  it('creates a plan whose tasks, edges and claims are rows, and logs it', async () => {
    const { plan, tasks } = await createPlan({ appId, title: 'p', tasks: [
      { key: 'a', title: 'A', files: ['x'] }, { key: 'b', title: 'B', dependsOn: ['a'], files: ['y'] },
    ] })
    expect(plan.integrationBranch).toBe(`plan/${plan.id}`)
    const g = (await planGraph(plan.id))!
    expect(g.tasks.map((t) => [t.number, t.status, t.dependsOn.length, t.files])).toEqual([[1, 'queued', 0, ['x']], [2, 'queued', 1, ['y']]])
    const log = await db.select().from(event).where(eq(event.planId, plan.id)).orderBy(asc(event.seq))
    expect(log.map((e) => e.type)).toEqual(['plan.created', 'task.created', 'task.created'])
    expect(log[0].workspaceId).toBe(wsId)
    expect(tasks).toHaveLength(2)
  })

  it('refuses cycles and unknown dependencies before writing anything', async () => {
    await expect(createPlan({ appId, title: 'bad', tasks: [{ key: 'a', title: 'A', dependsOn: ['b'] }, { key: 'b', title: 'B', dependsOn: ['a'] }] }))
      .rejects.toThrow(PlanError)
    await expect(createPlan({ appId, title: 'bad', tasks: [{ key: 'a', title: 'A', dependsOn: ['ghost'] }] })).rejects.toThrow(/unknown task ghost/)
  })

  it('a dispatch pass marks what can start ready, records why the rest wait, and releases dependents when parents are done', async () => {
    const { plan, tasks } = await createPlan({ appId, title: 'p', tasks: [
      { key: 'a', title: 'A', files: ['x'] }, { key: 'b', title: 'B', files: ['x'] }, { key: 'c', title: 'C', dependsOn: ['a'], files: ['z'] },
    ] })
    const [a, b, c] = tasks.map((t) => t.id)
    const first = await tick(plan.id, 4)
    expect(first.start).toEqual([a])
    expect(first.held).toEqual([{ id: b, reason: `shares files with ${a}` }, { id: c, reason: `waiting on ${a}` }])
    let g = (await planGraph(plan.id))!
    expect(g.tasks.map((t) => [t.status, t.heldReason])).toEqual([['ready', null], ['queued', `shares files with ${a}`], ['queued', `waiting on ${a}`]])

    await setTaskStatus(a, 'running'); await setTaskStatus(a, 'done')
    const second = await tick(plan.id, 4)
    expect(second.start.sort()).toEqual([b, c].sort())
    g = (await planGraph(plan.id))!
    expect(g.tasks.map((t) => t.status)).toEqual(['done', 'ready', 'ready'])

    const types = (await db.select().from(event).where(eq(event.taskId, a)).orderBy(asc(event.seq))).map((e) => `${e.type}:${(e.payload as any).to ?? ''}`)
    expect(types).toEqual(['task.created:', 'task.status:ready', 'task.status:running', 'task.status:done'])
  })
})
