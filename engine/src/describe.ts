/**
 * Describe: write the person-facing description for every task and phase of a plan that has none, from its title
 * and brief. One model call per plan, no tools, structured output. For plans written before descriptions existed,
 * and for anything hand-written in builder's language.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, phase, plan, task } from './db/schema.js'
import { appendEvent } from './events.js'
import { PlanError } from './plans.js'

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'description'], properties: { id: { type: 'string' }, description: { type: 'string' } } } } },
}

export async function describePlan(planId: string, opts: { model?: string } = {}) {
  const [p] = await db.select().from(plan).where(eq(plan.id, planId))
  if (!p) throw new PlanError(`no plan ${planId}`)
  const [a] = await db.select().from(app).where(eq(app.id, p.appId))
  const tasks = await db.select().from(task).where(and(eq(task.planId, planId), isNull(task.description)))
  const phases = await db.select().from(phase).where(and(eq(phase.planId, planId), isNull(phase.description)))
  const items = [...tasks.map((t) => ({ id: t.id, title: t.title, brief: t.brief ?? '' })), ...phases.map((x) => ({ id: x.id, title: x.title, brief: x.brief ?? '' }))]
  if (!items.length) return { described: 0 }
  const prompt = [
    `These are tasks and phases of the plan "${p.title}" for the app ${a.name}${p.spec ? ` (why: ${p.spec})` : ''}. Each has a title and a brief written for the engineer who builds it.`,
    'For each, write a description for the person who asked for it, who may never read the code: one to three short sentences saying what will be different for the people using the app, and why it matters.',
    'No file names, functions, tables, columns, routes, libraries or environment variables. Plain words that read aloud. Do not start with "This phase" or "This task".',
    'Return every id given, each with its description.',
    '',
    JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, brief: i.brief.slice(0, 4000) })), null, 1),
  ].join('\n')
  let out: unknown
  for await (const m of query({ prompt, options: { model: opts.model, maxTurns: 3, tools: [], allowedTools: [], settingSources: [], outputFormat: { type: 'json_schema', schema: SCHEMA } } })) {
    if (m.type === 'result') { if ((m as any).subtype !== 'success') throw new PlanError(`describe failed: ${(m as any).subtype}`); out = (m as any).structured_output }
  }
  const got = ((out as any)?.items ?? []) as { id: string; description: string }[]
  let n = 0
  for (const g of got) {
    const d = g.description?.trim()
    if (!d) continue
    if (tasks.some((t) => t.id === g.id)) { await db.update(task).set({ description: d }).where(and(eq(task.id, g.id), isNull(task.description))); n++ }
    else if (phases.some((x) => x.id === g.id)) { await db.update(phase).set({ description: d }).where(and(eq(phase.id, g.id), isNull(phase.description))); n++ }
  }
  await db.transaction((tx) => appendEvent(tx, { workspaceId: a.workspaceId, appId: a.id, planId, actor: 'engine', type: 'plan.described', payload: { described: n } }))
  return { described: n }
}
