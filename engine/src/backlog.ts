/**
 * A project's backlog: everything the project has to cover, so nothing has to be remembered by a person. Items come
 * from a person, the agent, an idea, the planner (what it noticed but left out of a task) or a builder (the same,
 * from a phase that landed). Every item ends one of two ways: covered by a task (a new one made from it, or one that
 * already does it) or dropped with a reason. Nothing disappears silently, and a project lands only when nothing in
 * its backlog is open (the runner checks).
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, type Tx } from './db/client.js'
import { app, backlogItem, idea, project, task } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { addTask, PlanError } from './projects.js'

export type BacklogSource = 'person' | 'agent' | 'idea' | 'planner' | 'builder'
export interface NewItem { text: string; body?: string; source?: BacklogSource; sourceRef?: Record<string, unknown>; ideaId?: string }

const CLOSED = ['landed', 'stopped', 'superseded']

async function openProject(tx: Tx | typeof db, projectId: string) {
  const [p] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!p) throw new PlanError(`no project ${projectId}`)
  if (CLOSED.includes(p.status)) throw new PlanError(`project is ${p.status}; its backlog is closed`)
  const [a] = await tx.select().from(app).where(eq(app.id, p.appId))
  return { p, base: { workspaceId: a.workspaceId, appId: a.id, projectId: p.id } }
}

async function getItem(tx: Tx | typeof db, itemId: string) {
  const [i] = await tx.select().from(backlogItem).where(eq(backlogItem.id, itemId))
  if (!i) throw new PlanError(`no backlog item ${itemId}`)
  return i
}

export const listBacklog = (projectId: string) => db.select().from(backlogItem).where(eq(backlogItem.projectId, projectId)).orderBy(asc(backlogItem.createdAt))

export async function openBacklogCount(projectId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(backlogItem).where(and(eq(backlogItem.projectId, projectId), eq(backlogItem.state, 'open')))
  return Number(n)
}

/** Add items to a project's backlog. Blank lines are skipped; an item the backlog already has open is not added twice. */
export async function addItems(projectId: string, items: NewItem[], actor = 'user', outer?: Tx) {
  const work = async (tx: Tx) => {
    const { base } = await openProject(tx, projectId)
    const open = new Set((await tx.select({ text: backlogItem.text }).from(backlogItem).where(and(eq(backlogItem.projectId, projectId), eq(backlogItem.state, 'open')))).map((r) => r.text.toLowerCase()))
    const rows = items.map((i) => ({ ...i, text: i.text?.trim().replace(/\s+/g, ' ') ?? '' })).filter((i) => i.text && !open.has(i.text.toLowerCase()) && (open.add(i.text.toLowerCase()), true)).map((i) => ({
      id: newId('backlog'), appId: base.appId, projectId, text: i.text.slice(0, 500), body: i.body?.trim() || null,
      source: i.source ?? 'person', sourceRef: i.sourceRef ?? null, ideaId: i.ideaId ?? null, createdBy: actor,
    }))
    if (!rows.length) return []
    const out = await tx.insert(backlogItem).values(rows).returning()
    for (const r of out) await appendEvent(tx, { ...base, actor, type: 'backlog.added', payload: { itemId: r.id, text: r.text, source: r.source } })
    return out
  }
  return outer ? work(outer) : db.transaction(work)
}

/** An idea joins a project's backlog: one item, linked to the idea, which leaves the inbox. */
export async function addIdea(projectId: string, ideaId: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const { p } = await openProject(tx, projectId)
    const [i] = await tx.select().from(idea).where(eq(idea.id, ideaId))
    if (!i || i.appId !== p.appId) throw new PlanError(`no idea ${ideaId} in this app`)
    const [already] = await tx.select().from(backlogItem).where(and(eq(backlogItem.projectId, projectId), eq(backlogItem.ideaId, ideaId), inArray(backlogItem.state, ['open', 'covered'])))
    if (already) throw new PlanError(`idea #${i.number} is already in this project's backlog`)
    const [row] = await addItems(projectId, [{ text: i.title, body: i.body ?? undefined, source: 'idea', ideaId: i.id }], actor, tx)
    if (!row) throw new PlanError(`the backlog already has "${i.title}" open`)
    if (i.lane === 'inbox') await tx.update(idea).set({ lane: 'build', updatedAt: new Date() }).where(eq(idea.id, i.id))
    return row
  })
}

/** An open item becomes a new task at the end of the project; the item is covered by it. */
export async function itemToTask(itemId: string, input: { title?: string; description?: string; brief?: string } = {}, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await getItem(tx, itemId)
    if (i.state !== 'open') throw new PlanError(`that item is already ${i.state}`)
    const { base } = await openProject(tx, i.projectId)
    const t = await addTask(i.projectId, { title: input.title?.trim() || i.text, description: input.description, brief: input.brief ?? [i.text, i.body].filter(Boolean).join('\n\n'), ideaId: i.ideaId ?? undefined }, actor, tx)
    const [row] = await tx.update(backlogItem).set({ state: 'covered', taskId: t.id, resolvedBy: actor, resolvedAt: new Date() }).where(eq(backlogItem.id, itemId)).returning()
    await appendEvent(tx, { ...base, taskId: t.id, actor, type: 'backlog.covered', payload: { itemId, text: i.text, taskNumber: t.number, newTask: true } })
    return { item: row, task: t }
  })
}

/** An open item is covered by a task the project already has. */
export async function coverItem(itemId: string, taskId: string, reason?: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await getItem(tx, itemId)
    if (i.state !== 'open') throw new PlanError(`that item is already ${i.state}`)
    const { base } = await openProject(tx, i.projectId)
    const [t] = await tx.select().from(task).where(eq(task.id, taskId))
    if (!t || t.projectId !== i.projectId) throw new PlanError('that task is not in this project')
    const [row] = await tx.update(backlogItem).set({ state: 'covered', taskId, reason: reason?.trim() || null, resolvedBy: actor, resolvedAt: new Date() }).where(eq(backlogItem.id, itemId)).returning()
    await appendEvent(tx, { ...base, taskId, actor, type: 'backlog.covered', payload: { itemId, text: i.text, taskNumber: t.number, newTask: false } })
    return row
  })
}

/** An open item is dropped; the reason is required, so the backlog says why it was not done. */
export async function dropItem(itemId: string, reason: string, actor = 'user') {
  if (!reason?.trim()) throw new PlanError('say why it is dropped')
  return db.transaction(async (tx) => {
    const i = await getItem(tx, itemId)
    if (i.state !== 'open') throw new PlanError(`that item is already ${i.state}`)
    const { base } = await openProject(tx, i.projectId)
    const [row] = await tx.update(backlogItem).set({ state: 'dropped', reason: reason.trim(), resolvedBy: actor, resolvedAt: new Date() }).where(eq(backlogItem.id, itemId)).returning()
    await appendEvent(tx, { ...base, actor, type: 'backlog.dropped', payload: { itemId, text: i.text, reason: row.reason } })
    return row
  })
}

/** A covered or dropped item goes back to open (the task it pointed at stays). */
export async function reopenItem(itemId: string, actor = 'user') {
  return db.transaction(async (tx) => {
    const i = await getItem(tx, itemId)
    if (i.state === 'open') return i
    const { base } = await openProject(tx, i.projectId)
    const [row] = await tx.update(backlogItem).set({ state: 'open', taskId: null, reason: null, resolvedBy: null, resolvedAt: null }).where(eq(backlogItem.id, itemId)).returning()
    await appendEvent(tx, { ...base, actor, type: 'backlog.reopened', payload: { itemId, text: i.text, was: i.state } })
    return row
  })
}

/**
 * A builder's "left for later": the bullet lines under a `Later:` line at the end of its summary. The builder is
 * asked to write it that way (executor.ts); anything else in the summary is ignored.
 */
export function laterFrom(summary: string | null | undefined): string[] {
  if (!summary) return []
  const lines = summary.split('\n')
  const at = lines.map((l) => /^\s*(#+\s*)?(\*\*|__)?(left for )?later:?(\*\*|__)?:?\s*$/i.test(l)).lastIndexOf(true)
  if (at < 0) return []
  const out: string[] = []
  for (const l of lines.slice(at + 1)) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/)
    if (m) out.push(m[1].replace(/^\[ \]\s*/, ''))
    else if (l.trim() && out.length) break
  }
  return out.filter((t) => !/^(none|nothing|n\/a)\.?$/i.test(t))
}
