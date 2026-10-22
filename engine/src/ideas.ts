/**
 * Ideas: the inbox. An idea is a title and a body, captured in a moment; it becomes one task (a plan of one) or a
 * plan of several. Nothing is lost: an idea that never becomes a plan stays in the inbox with its lane.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, idea } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { createPlan, PlanError } from './plans.js'

export const listIdeas = (appId?: string) => (appId ? db.select().from(idea).where(eq(idea.appId, appId)) : db.select().from(idea)).orderBy(desc(idea.number))

export async function createIdea(input: { appId: string; title: string; body?: string; actor?: string }) {
  if (!input.title?.trim()) throw new PlanError('an idea needs a title')
  return db.transaction(async (tx) => {
    const [a] = await tx.select().from(app).where(eq(app.id, input.appId))
    if (!a) throw new PlanError(`no app ${input.appId}`)
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${idea.number}), 0)` }).from(idea).where(eq(idea.appId, a.id))
    const [row] = await tx.insert(idea).values({
      id: newId('idea'), appId: a.id, number: Number(max) + 1, title: input.title.trim(), body: input.body?.trim() || null, source: 'person', lane: 'inbox',
    }).returning()
    await appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, ideaId: row.id, actor: input.actor ?? 'user', type: 'idea.created', payload: { number: row.number, title: row.title } })
    return row
  })
}

/** An idea becomes a plan: one task by default (the idea's title, its body as the brief), or the tasks given. */
export async function planFromIdea(ideaId: string, tasks?: { title: string; brief?: string }[]) {
  const [i] = await db.select().from(idea).where(eq(idea.id, ideaId))
  if (!i) throw new PlanError(`no idea ${ideaId}`)
  return createPlan({ // createPlan moves the idea to the 'build' lane
    appId: i.appId, title: i.title, spec: i.body ?? undefined, ideaId: i.id,
    tasks: tasks?.length ? tasks : [{ title: i.title, brief: i.body ?? undefined }],
  })
}
