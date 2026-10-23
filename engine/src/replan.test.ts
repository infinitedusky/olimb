/** Clearing a draft task's phases so it can be planned again: what goes, what is refused. */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, decision, project, question, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { planTask, type Propose } from './planner.js'
import { clearPhases, createProject, PlanError, projectGraph } from './projects.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('clearPhases', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'replan test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app' })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: '/tmp' })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('removes the phases, their edges and claims, and the planner\'s decisions and questions', async () => {
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'a', title: 'A', description: 'For a person.', summary: 's', depends_on: [], files: ['x.py'], steps: [], checks: [], done_when: '' },
        { key: 'b', title: 'B', description: 'For a person.', summary: 's', depends_on: ['a'], files: ['y.py'], steps: [], checks: [], done_when: '' }],
      decisions: [{ title: 'd', chosen: 'c', rejected: [], reason: 'r' }],
      questions: [{ question: 'q?', options: [{ label: 'yes', description: '', changes: [] }, { label: 'no', description: '', changes: [] }], recommended: 'yes', reason: 'r', cost: 'cheap' }],
      notes: '',
    } })
    const { project: p, tasks } = await createProject({ appId, title: 'replan', tasks: [{ title: 'T', brief: 'b' }] })
    await planTask(tasks[0].id, { propose })
    expect((await projectGraph(p.id))!.phases).toHaveLength(2)
    expect(await clearPhases(tasks[0].id)).toEqual({ cleared: 2 })
    const g = (await projectGraph(p.id))!
    expect(g.phases).toHaveLength(0); expect(g.decisions).toHaveLength(0); expect(g.questions).toHaveLength(0)
    expect(await db.select().from(decision).where(eq(decision.taskId, tasks[0].id))).toHaveLength(0)
    expect(await db.select().from(question).where(eq(question.taskId, tasks[0].id))).toHaveLength(0)
    const again = await planTask(tasks[0].id, { propose }) // plannable again
    expect(again.status).toBe('completed')
  })

  it('refuses when another task\'s phases depend on these, and when the project is not a draft', async () => {
    const { project: p, tasks } = await createProject({ appId, title: 'deps', tasks: [
      { title: 'T1', phases: [{ key: 'a', title: 'A' }] }, { title: 'T2', phases: [{ key: 'b', title: 'B', dependsOn: ['a'] }] },
    ] })
    await expect(clearPhases(tasks[0].id)).rejects.toThrow(/depend on this task/)
    expect(await clearPhases(tasks[1].id)).toEqual({ cleared: 1 })
    expect(await clearPhases(tasks[0].id)).toEqual({ cleared: 1 })
    await db.update(project).set({ status: 'running' }).where(eq(project.id, p.id))
    await expect(clearPhases(tasks[0].id)).rejects.toThrow(PlanError)
  })
})
