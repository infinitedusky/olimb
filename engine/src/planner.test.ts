/**
 * The planner with a fake proposer against the test database: the proposal becomes phases (with composed briefs,
 * dependencies and file claims), provisional decisions and open questions whose cost the server sets; the run row
 * and events record it; a failed proposal is a failed run and nothing else; a planned task is not planned twice.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, plan, repo, run, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { phaseBrief, planTask, questionCost, validateProposal, type Proposal, type Propose } from './planner.js'
import { createPlan, PlanError, planGraph } from './plans.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const proposal: Proposal = {
  phases: [
    { key: 'schema', title: 'Add the settings table', summary: 'A table for the gate schedule.', depends_on: [], files: ['poc/hg/db.py'],
      steps: [{ text: 'Add the table', technical: 'db.py: CREATE TABLE settings' }, { text: 'Migrate on boot', technical: 'init_db()' }],
      checks: [{ statement: 'The app starts with a fresh database', command: 'pytest -q poc', expected: 'all passing' }], done_when: 'Settings persist across restarts.' },
    { key: 'ui', title: 'Parent page edits the schedule', summary: 'A form.', depends_on: ['schema'], files: ['poc/hg/app.py', 'poc/hg/templates'],
      steps: [{ text: 'Render the form', technical: '' }], checks: [], done_when: 'A parent can set the unlock period.' },
  ],
  decisions: [{ title: 'Where the schedule lives', chosen: 'A settings table in SQLite', rejected: ['Environment variables', 'A JSON file'], reason: 'It changes at runtime from the parent page.' }],
  questions: [
    { question: 'Should the default unlock period be 3–10pm?', options: [{ label: 'Yes', description: 'Matches the current hard-coded default.', changes: [] }, { label: 'No default', description: 'Locked until a parent sets one.', changes: ['brief'] }], recommended: 'Yes', reason: 'It is what works today.', cost: 'cheap' },
    { question: 'Minutes or whole hours?', options: [{ label: 'Minutes', description: '', changes: [] }, { label: 'Hours', description: '', changes: [] }], recommended: 'Minutes', reason: 'Parents asked for 3:30.', cost: 'cheap' },
  ],
  notes: 'Assumed the parent page stays server-rendered.',
}

describe.skipIf(!reachable)('planner', () => {
  const wsId = newId('workspace')
  let appId: string

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-planner-'))
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'planner test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', setup: { test_cmd: 'true', model: 'claude-fake' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: dir })
  })
  afterAll(async () => {
    await db.update(plan).set({ status: 'superseded' }).where(eq(plan.appId, appId))
    await pool.end()
  })

  const fake = (p: Proposal | Error): Propose => async (i) => {
    await i.onEvent('run.message', { text: `planning ${i.task.title} in ${i.repoPath}` })
    if (p instanceof Error) return { status: 'failed', error: p.message, costUsd: 0.1 }
    return { status: 'completed', proposal: p, costUsd: 0.42, agentSessionId: 'sess-plan', numTurns: 7 }
  }

  it('turns a proposal into phases, decisions and questions, and records the run', async () => {
    const { plan: p, tasks } = await createPlan({ appId, title: 'planned', tasks: [
      { title: 'Groundwork', phases: [{ key: 'g', title: 'G', files: ['README.md'] }] },
      { title: 'Settings and the gate', brief: 'Parents set when the gate is open.' },
    ] })
    const out = await planTask(tasks[1].id, { propose: fake(proposal) })
    expect(out.status).toBe('completed')
    expect(out.phases.map((x) => x.title)).toEqual(['Add the settings table', 'Parent page edits the schedule'])

    const g = (await planGraph(p.id))!
    const mine = g.phases.filter((x) => x.taskId === tasks[1].id)
    expect(mine).toHaveLength(2)
    const [schema, ui] = mine
    expect(ui.dependsOn).toEqual([schema.id])
    expect(ui.files).toEqual(['poc/hg/app.py', 'poc/hg/templates'])
    expect(schema.brief).toContain('A table for the gate schedule.')
    expect(schema.brief).toContain('1. Add the table — db.py: CREATE TABLE settings')
    expect(schema.brief).toContain('- The app starts with a fresh database (`pytest -q poc` → all passing)')
    expect(schema.brief).toContain('Done when: Settings persist across restarts.')
    expect(schema.createdBy).toBe('planner')

    expect(g.decisions).toHaveLength(1)
    expect(g.decisions[0]).toMatchObject({ taskId: tasks[1].id, question: 'Where the schedule lives', chosen: 'A', provisional: true, rationale: 'It changes at runtime from the parent page.' })
    expect((g.decisions[0].options as any[]).map((o) => o.text)).toEqual(['A settings table in SQLite', 'Environment variables', 'A JSON file'])

    expect(g.questions.map((q) => [q.text, q.cost, q.status])).toEqual([
      ['Should the default unlock period be 3–10pm?', 'expensive', 'open'], // an option changes the brief: the server raised it
      ['Minutes or whole hours?', 'cheap', 'open'],
    ])
    expect((g.questions[0].options as any[]).find((o) => o.recommended).label).toBe('Yes')
    expect(g.questions[0].reason).toBe('It is what works today.')

    const [r] = await db.select().from(run).where(eq(run.id, out.runId))
    expect(r).toMatchObject({ kind: 'plan', taskId: tasks[1].id, phaseId: null, status: 'completed', agentSessionId: 'sess-plan', model: 'claude-fake', attempt: 1 })
    expect(Number(r.costUsd)).toBe(0.42)
    expect(r.summary).toContain('Assumed the parent page stays server-rendered.')

    const types = (await db.select().from(event).where(eq(event.taskId, tasks[1].id))).map((e) => e.type)
    expect(types).toContain('task.planning'); expect(types).toContain('run.message'); expect(types).toContain('phase.created')
    expect(types.filter((t) => t === 'question.asked')).toHaveLength(2); expect(types.at(-1)).toBe('task.planned')
  })

  it('a failed proposal is a failed run: no phases, a task.plan_failed event, and the task can be planned again', async () => {
    const { plan: p, tasks } = await createPlan({ appId, title: 'failing', tasks: [{ title: 'T', brief: 'b' }] })
    const out = await planTask(tasks[0].id, { propose: fake(new Error('error_max_turns')) })
    expect(out).toMatchObject({ status: 'failed', error: 'error_max_turns', phases: [] })
    expect((await planGraph(p.id))!.phases).toHaveLength(0)
    const [r] = await db.select().from(run).where(eq(run.id, out.runId))
    expect(r).toMatchObject({ status: 'failed', error: 'error_max_turns' })
    const types = (await db.select().from(event).where(eq(event.taskId, tasks[0].id))).map((e) => e.type)
    expect(types.at(-1)).toBe('task.plan_failed')
    const again = await planTask(tasks[0].id, { propose: fake(proposal) })
    expect(again.status).toBe('completed')
    expect((await db.select().from(run).where(eq(run.id, again.runId)))[0].attempt).toBe(2)
  })

  it('refuses a task that already has phases, and a proposal that does not hold together', async () => {
    const { tasks } = await createPlan({ appId, title: 'twice', tasks: [{ title: 'T', phases: [{ key: 'x', title: 'X' }] }] })
    await expect(planTask(tasks[0].id, { propose: fake(proposal) })).rejects.toThrow(PlanError)
    const bad = (patch: Partial<Proposal>) => () => validateProposal({ ...proposal, ...patch })
    expect(bad({ phases: [] })).toThrow('no phases')
    expect(bad({ phases: [{ ...proposal.phases[0] }, { ...proposal.phases[0] }] })).toThrow('used twice')
    expect(bad({ phases: [{ ...proposal.phases[1] }] })).toThrow('unknown phase schema')
    expect(bad({ questions: [{ ...proposal.questions[1], recommended: 'Days' }] })).toThrow('does not offer')
    expect(bad({ questions: [{ ...proposal.questions[1], options: proposal.questions[1].options.slice(0, 1) }] })).toThrow('at least two options')
  })

  it('composes briefs and sets costs', () => {
    expect(phaseBrief({ key: 'k', title: 't', summary: 'Just this.', depends_on: [], files: [], steps: [], checks: [], done_when: '' })).toBe('Just this.')
    expect(questionCost({ ...proposal.questions[1], cost: 'moderate' })).toBe('moderate')
    expect(questionCost({ ...proposal.questions[1], cost: 'cheap', options: [{ label: 'a', description: '', changes: ['gate'] }, { label: 'b', description: '', changes: [] }] })).toBe('expensive')
  })
})
