/**
 * A project's backlog: items are kept once, an idea joins and leaves the inbox, an item ends covered by a task or
 * dropped with a reason (never silently), a closed project's backlog is closed, the planner's "later" joins it, and
 * a builder's "Later:" lines are read from its summary.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addIdea, addItems, coverItem, dropItem, itemToTask, laterFrom, listBacklog, reopenItem } from './backlog.js'
import { db, pool } from './db/client.js'
import { app, idea, project, repo, workspace } from './db/schema.js'
import { newId } from './ids.js'
import { createIdea } from './ideas.js'
import { planTask, type Propose } from './planner.js'
import { createProject, PlanError, projectGraph } from './projects.js'

describe('laterFrom', () => {
  it('reads the bullets under a Later: line, and nothing else', () => {
    expect(laterFrom('Changed the cart.\n\nTested with pnpm test.\n\nLater:\n- The header link 404s\n* Discount codes are case-sensitive\n')).toEqual(['The header link 404s', 'Discount codes are case-sensitive'])
    expect(laterFrom('Done.\n\n**Later:**\n1. Add a test for refunds\n\nThat is all.')).toEqual(['Add a test for refunds'])
    expect(laterFrom('Done. Nothing for later here.\n- a list that is not under Later')).toEqual([])
    expect(laterFrom('Later:\n- none')).toEqual([])
    expect(laterFrom(undefined)).toEqual([])
  })
})

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

describe.skipIf(!reachable)('backlog', () => {
  const wsId = newId('workspace')
  let appId: string
  beforeAll(async () => {
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'backlog test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', setup: { test_cmd: 'true' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: await mkdtemp(join(tmpdir(), 'if-backlog-')) })
  })
  afterAll(async () => {
    await db.update(project).set({ status: 'superseded' }).where(eq(project.appId, appId))
    await pool.end()
  })

  it('keeps items once, takes an idea out of the inbox, and every item ends covered or dropped with a reason', async () => {
    const { project: p, tasks } = await createProject({ appId, title: 'with a backlog', tasks: [{ title: 'Checkout' }] })
    const added = await addItems(p.id, [{ text: '  Refunds  ' }, { text: 'refunds' }, { text: '' }, { text: 'Gift cards', body: 'people asked twice' }])
    expect(added.map((i) => [i.text, i.source, i.state])).toEqual([['Refunds', 'person', 'open'], ['Gift cards', 'person', 'open']])

    const i = await createIdea({ appId, title: 'Saved carts' })
    const fromIdea = await addIdea(p.id, i.id)
    expect(fromIdea).toMatchObject({ text: 'Saved carts', source: 'idea', ideaId: i.id })
    expect((await db.select().from(idea).where(eq(idea.id, i.id)))[0].lane).toBe('build')
    await expect(addIdea(p.id, i.id)).rejects.toThrow(/already in this project/)

    const [refunds, gift] = added
    const made = await itemToTask(refunds.id)
    expect(made.task).toMatchObject({ title: 'Refunds', brief: 'Refunds', position: 1 })
    expect(made.item).toMatchObject({ state: 'covered', taskId: made.task.id })
    await expect(itemToTask(refunds.id)).rejects.toThrow(/already covered/)

    await coverItem(fromIdea.id, tasks[0].id, 'checkout keeps the cart')
    await expect(dropItem(gift.id, '  ')).rejects.toThrow(/why/)
    const dropped = await dropItem(gift.id, 'not this season')
    expect(dropped).toMatchObject({ state: 'dropped', reason: 'not this season' })
    expect((await reopenItem(gift.id))).toMatchObject({ state: 'open', reason: null })

    const g = (await projectGraph(p.id))!
    expect(g.tasks.map((t) => t.title)).toEqual(['Checkout', 'Refunds'])
    expect(g.backlog.map((b) => [b.text, b.state])).toEqual([['Refunds', 'covered'], ['Gift cards', 'open'], ['Saved carts', 'covered']])

    await db.update(project).set({ status: 'landed' }).where(eq(project.id, p.id))
    await expect(addItems(p.id, [{ text: 'too late' }])).rejects.toThrow(PlanError)
    await expect(dropItem(gift.id, 'closed')).rejects.toThrow(/landed/)
  })

  it('what the planner noticed but left out joins the backlog', async () => {
    const { project: p, tasks } = await createProject({ appId, title: 'planner later', tasks: [{ title: 'Measure checkout' }] })
    const propose: Propose = async () => ({ status: 'completed', costUsd: 0, proposal: {
      phases: [{ key: 'a', title: 'A', description: 'a', summary: 'a', depends_on: [], files: ['a.ts'], steps: [], checks: [], done_when: '' }],
      decisions: [], questions: [], notes: '',
      later: [{ text: 'The cart page has no empty state', why: 'seen while reading cart.tsx' }],
    } })
    await planTask(tasks[0].id, { propose })
    expect((await listBacklog(p.id)).map((b) => [b.text, b.body, b.source, (b.sourceRef as any)?.taskId])).toEqual([['The cart page has no empty state', 'seen while reading cart.tsx', 'planner', tasks[0].id]])
  })
})
