/**
 * Plans, tasks, phases, the dispatch pass and the event log, against a real Postgres (the test database the global
 * setup creates). Skipped when the database isn't reachable, so `pnpm test` still runs the pure tests anywhere.
 */
import { asc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, plan, workspace } from './db/schema.js'
import { addPhases, createPlan, PlanError, planGraph, setPhaseStatus, tick } from './plans.js'
import { newId } from './ids.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('plans in Postgres', () => {
  const wsId = newId('workspace'), appId = newId('app')
  beforeAll(async () => {
    await db.insert(workspace).values({ id: wsId, name: 'test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'test app' })
  })
  afterAll(async () => {
    await db.update(plan).set({ status: 'superseded' }).where(eq(plan.appId, appId))
    await pool.end()
  })

  it('creates a plan whose tasks, phases, edges and claims are rows, and logs it', async () => {
    const { plan: p, tasks, phases } = await createPlan({ appId, title: 'p', tasks: [
      { title: 'T1', brief: 'first', phases: [{ key: 'a', title: 'A', files: ['x'] }, { key: 'b', title: 'B', dependsOn: ['a'], files: ['y'] }] },
      { title: 'T2', phases: [{ key: 'c', title: 'C', files: ['z'] }] },
    ] })
    expect(p.integrationBranch).toBe(`plan/${p.id}`)
    expect(tasks.map((t) => [t.number, t.position, t.title])).toEqual([[1, 0, 'T1'], [2, 1, 'T2']])
    const g = (await planGraph(p.id))!
    expect(g.tasks.map((t) => t.phaseIds.length)).toEqual([2, 1])
    expect(g.phases.map((x) => [x.number, x.status, x.dependsOn.length, x.files])).toEqual([[1, 'queued', 0, ['x']], [2, 'queued', 1, ['y']], [3, 'queued', 0, ['z']]])
    const log = await db.select().from(event).where(eq(event.planId, p.id)).orderBy(asc(event.seq))
    expect(log.map((e) => e.type)).toEqual(['plan.created', 'task.created', 'task.created', 'phase.created', 'phase.created', 'phase.created'])
    expect(log[0].workspaceId).toBe(wsId)
    expect(phases).toHaveLength(3)
  })

  it('refuses cycles, unknown dependencies, and a dependency on a later task', async () => {
    await expect(createPlan({ appId, title: 'bad', tasks: [{ title: 'T', phases: [{ key: 'a', title: 'A', dependsOn: ['b'] }, { key: 'b', title: 'B', dependsOn: ['a'] }] }] })).rejects.toThrow(PlanError)
    await expect(createPlan({ appId, title: 'bad', tasks: [{ title: 'T', phases: [{ key: 'a', title: 'A', dependsOn: ['ghost'] }] }] })).rejects.toThrow(/unknown phase ghost/)
    await expect(createPlan({ appId, title: 'bad', tasks: [
      { title: 'T1', phases: [{ key: 'a', title: 'A', dependsOn: ['b'] }] }, { title: 'T2', phases: [{ key: 'b', title: 'B' }] },
    ] })).rejects.toThrow(/later task/)
    await expect(createPlan({ appId, title: 'bad', tasks: [] })).rejects.toThrow(/at least one task/)
  })

  it('a dispatch pass starts what it can, holds the rest with reasons, and treats task order as a dependency', async () => {
    const { plan: p, tasks, phases } = await createPlan({ appId, title: 'p', tasks: [
      { title: 'T1', phases: [{ key: 'a', title: 'A', files: ['x'] }, { key: 'b', title: 'B', files: ['x'] }] },
      { title: 'T2', phases: [{ key: 'c', title: 'C', files: ['z'] }] },
    ] })
    const [a, b, c] = phases.map((x) => x.id)
    const n = phases[0].number // phase numbers run per app, across plans
    const first = await tick(p.id, 4)
    expect(first.start).toEqual([a])
    let g = (await planGraph(p.id))!
    expect(g.phases.map((x) => [x.status, x.heldReason])).toEqual([
      ['ready', null], ['queued', `shares files with phase #${n}`], ['queued', `waiting on phase #${n} (task #${tasks[0].number}, earlier in the plan)`],
    ])
    await setPhaseStatus(a, 'running'); await setPhaseStatus(a, 'done')
    expect((await tick(p.id, 4)).start).toEqual([b]) // c still waits: b (task 1) hasn't landed
    await setPhaseStatus(b, 'done')
    expect((await tick(p.id, 4)).start).toEqual([c])
    g = (await planGraph(p.id))!
    expect(g.phases.map((x) => x.status)).toEqual(['done', 'done', 'ready'])
    const types = (await db.select().from(event).where(eq(event.phaseId, a)).orderBy(asc(event.seq))).map((e) => `${e.type}:${(e.payload as any).to ?? ''}`)
    expect(types).toEqual(['phase.created:', 'phase.status:ready', 'phase.status:running', 'phase.status:done'])
  })

  it('phases can be added to a task later, depending on phases already there', async () => {
    const { plan: p, tasks, phases } = await createPlan({ appId, title: 'p', tasks: [{ title: 'T', phases: [{ key: 'a', title: 'A' }] }] })
    const added = await addPhases(tasks[0].id, [{ key: 'b', title: 'B', dependsOn: [phases[0].id], files: ['q'] }, { key: 'c', title: 'C', dependsOn: ['b'] }], 'planner')
    expect(added.map((x) => x.number)).toEqual([phases[0].number + 1, phases[0].number + 2])
    const g = (await planGraph(p.id))!
    expect(g.phases.map((x) => x.dependsOn.length)).toEqual([0, 1, 1])
    expect(g.phases[1].createdBy).toBe('planner')
    await expect(addPhases(tasks[0].id, [{ key: 'd', title: 'D', dependsOn: ['nope'] }])).rejects.toThrow(/unknown phase nope/)
  })
})
