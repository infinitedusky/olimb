/**
 * The planner: a task's brief → phases, decisions and questions, as rows. InDusk's approach on the new foundation:
 * one agent run with read-only tools on the repo, returning one validated object (Agent SDK structured output),
 * with a self-review pass inside the same run. Nothing is decided silently: a choice the planner settles from the
 * brief and the code is a decision (provisional until a person approves); one it cannot settle is a question. The
 * server sets the cost of every question, never the agent.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { and, eq, sql } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, decision, question, repo, run, task } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { handle } from './executor.js'
import { guardOptions, readerGuard } from './guard.js'
import { newId } from './ids.js'
import { addPhases, PlanError, planGraph, type NewPhase } from './plans.js'

export interface ProposeInput {
  repoPath: string
  task: { number: number; title: string; brief: string | null }
  plan: { title: string; spec: string | null }
  earlier: { number: number; title: string; phases: { number: number; title: string }[] }[] // tasks before this one in the plan
  testCmd?: string
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  abort?: AbortController
  onEvent: (type: string, payload: Record<string, unknown>) => Promise<void>
}

export type Changes = 'brief' | 'promise' | 'look' | 'gate'
export type Cost = 'cheap' | 'moderate' | 'expensive'
export interface Proposal {
  phases: {
    key: string; title: string; description: string; summary: string; depends_on: string[]; files: string[]
    steps: { text: string; technical: string }[]
    checks: { statement: string; command: string; expected: string }[]
    done_when: string
  }[]
  decisions: { title: string; chosen: string; rejected: string[]; reason: string }[]
  questions: { question: string; options: { label: string; description: string; changes: Changes[] }[]; recommended: string; reason: string; cost: Cost }[]
  notes: string
}
export interface ProposeOutput { status: 'completed' | 'failed'; proposal?: Proposal; agentSessionId?: string; costUsd?: number; numTurns?: number; error?: string }
export type Propose = (i: ProposeInput) => Promise<ProposeOutput>

const str = { type: 'string' } as const
const arr = (items: unknown) => ({ type: 'array', items })
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

/** What the planner must return. Every field is required; "none" is an empty string or array. */
export const PROPOSAL_SCHEMA = obj({
  phases: arr(obj({
    key: str, title: str, description: str, summary: str, depends_on: arr(str), files: arr(str),
    steps: arr(obj({ text: str, technical: str })),
    checks: arr(obj({ statement: str, command: str, expected: str })),
    done_when: str,
  })),
  decisions: arr(obj({ title: str, chosen: str, rejected: arr(str), reason: str })),
  questions: arr(obj({
    question: str,
    options: arr(obj({ label: str, description: str, changes: arr({ type: 'string', enum: ['brief', 'promise', 'look', 'gate'] }) })),
    recommended: str, reason: str, cost: { type: 'string', enum: ['cheap', 'moderate', 'expensive'] },
  })),
  notes: str,
})

function prompt(i: ProposeInput): string {
  const earlier = i.earlier.length
    ? i.earlier.map((t) => `  - task #${t.number} ${t.title}${t.phases.length ? `: ${t.phases.map((p) => `#${p.number} ${p.title}`).join('; ')}` : ' (no phases yet)'}`).join('\n')
    : '  (none: this is the first task)'
  return [
    `You are planning task #${i.task.number}: ${i.task.title}`,
    `It is part of the plan "${i.plan.title}".`,
    '',
    i.task.brief ?? '(The task has no brief beyond its title.)',
    i.plan.spec ? `\nWhy the plan exists:\n${i.plan.spec}` : '',
    '',
    'Tasks earlier in the plan (their phases land before yours start; you need not depend on them explicitly):',
    earlier,
    '',
    'Read the repository until you understand where this change lives: the files, the tests, the conventions, what already exists. You have read-only tools; you change nothing. Then cut the task into phases.',
    '',
    'Phases:',
    '- One phase is one agent in one git worktree making one commit. Each phase lands on its own, so each must leave the tests passing by itself. Phases of this task that share no files run at the same time.',
    '- Cut by what each phase produces and consumes: granular enough to track, not so granular they are busywork. Most tasks are one to six phases; a small task is one phase.',
    '- files: the paths (files or directories, relative to the repository root) the phase will change. Two phases that share a path never run at once. Declare honestly: a phase with no files declared claims the whole app.',
    '- depends_on: keys of phases in this task whose result this phase needs. Prefer fewer; a shared file already serializes two phases.',
    '- title: what will be true when it lands, in plain words ("Parents sign in with Clerk"), not the code change.',
    '- description: one to three short sentences for the person who asked for this, who may never read the code: what will be different for the people using the app, and why it matters. No file names, functions, columns, routes or environment variables. Write it so it reads aloud.',
    '- summary: for the builder, in short paragraphs (a blank line between them, at most four sentences each): what the phase does in this codebase and why. File names and code go in backticks.',
    '- steps: the work in order, one action each, each with a technical note (the file, the function, the approach) so the builder does not rediscover it. Keep each step to one sentence; put detail in the note.',
    '- checks: behavioural checks a non-engineer could read aloud, with the command and the expected result where there is one.',
    '- done_when: one sentence.',
    i.testCmd ? `- The tests run with: ${i.testCmd}` : '- There is no test command configured; say in each phase how it is verified.',
    '',
    'Decisions and questions:',
    '- A choice you can settle from the brief and the code: settle it, and record it as a decision with the alternatives you rejected and the reason. Never settle such a choice silently.',
    '- A choice the brief does not settle, where the person might reasonably want it either way: ask it as a question. Give at least two options, say which you recommend and why, and for each option say what it changes (brief, promise, look, gate) when it changes what was agreed. Rate the cost of getting it wrong: cheap (easy to undo), moderate, expensive. Plan the phases as if your recommendation were chosen.',
    '- notes: what you assumed, and anything in the brief you could not place in the code.',
    '',
    'Before you answer, review your own plan once: does it build what the brief asks and nothing it does not? What else would have to change for it to hold? What would the phases do that the brief never asked for? Fix what you find, then answer.',
  ].join('\n')
}

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS']

/** The real planner: one Claude Code run, read-only in the repo, ending in a structured proposal. */
export const proposeWithAgent: Propose = async (i) => {
  let out: ProposeOutput = { status: 'failed', error: 'no result message' }
  let structured: unknown
  try {
    for await (const m of query({
      prompt: prompt(i),
      options: {
        cwd: i.repoPath,
        abortController: i.abort,
        model: i.model,
        maxTurns: i.maxTurns ?? 40,
        maxBudgetUsd: i.maxBudgetUsd,
        settingSources: ['project'],
        tools: [...READ_TOOLS, 'Bash'], // the whole tool set
        allowedTools: READ_TOOLS, // auto-approved; the guard decides Bash (see guard.ts)
        permissionMode: 'default',
        outputFormat: { type: 'json_schema', schema: PROPOSAL_SCHEMA },
        ...guardOptions(readerGuard(READ_TOOLS)),
      },
    })) {
      if (m.type === 'result') structured = (m as any).structured_output
      await handle(m, i.onEvent, (o) => { out = { status: o.status, agentSessionId: o.agentSessionId, costUsd: o.costUsd, numTurns: o.numTurns, error: o.error } })
    }
  } catch (err: any) {
    const error = String(err?.message ?? err).slice(0, 1000)
    await i.onEvent('run.error', { error })
    return { ...out, status: 'failed', error }
  }
  if (out.status !== 'completed') return out
  if (!structured) return { ...out, status: 'failed', error: 'the planner finished without a structured proposal' }
  return { ...out, proposal: structured as Proposal }
}

/** The server sets the cost: any option that changes what was agreed makes the question expensive, whatever the agent said. */
export function questionCost(q: Proposal['questions'][number]): Cost {
  return q.options.some((o) => (o.changes ?? []).length > 0) ? 'expensive' : q.cost
}

/** The phase's brief, as the builder will read it: the summary, then the steps, checks and done-when the planner wrote. */
/** The phase's brief, as Markdown: the summary, then steps (each with its technical note under it), checks and done-when. */
export function phaseBrief(p: Proposal['phases'][number]): string {
  const steps = p.steps.map((s, n) => `${n + 1}. ${s.text}${s.technical ? `\n   - ${s.technical}` : ''}`).join('\n')
  const checks = p.checks.map((c) => `- ${c.statement}${c.command ? ` — \`${c.command}\`${c.expected ? ` → ${c.expected}` : ''}` : ''}`).join('\n')
  return [p.summary.trim(), steps && `### Steps\n\n${steps}`, checks && `### Checks\n\n${checks}`, p.done_when && `**Done when:** ${p.done_when.trim()}`].filter(Boolean).join('\n\n')
}

/** Shape problems the schema cannot catch. Throws PlanError. */
export function validateProposal(p: Proposal) {
  if (!Array.isArray(p?.phases) || !p.phases.length) throw new PlanError('the proposal has no phases')
  const keys = new Set<string>()
  for (const x of p.phases) {
    if (!x.key?.trim() || !x.title?.trim()) throw new PlanError('every phase needs a key and a title')
    if (keys.has(x.key)) throw new PlanError(`phase key ${x.key} is used twice`)
    keys.add(x.key)
  }
  for (const x of p.phases) for (const d of x.depends_on ?? []) if (!keys.has(d)) throw new PlanError(`phase ${x.key} depends on unknown phase ${d}`)
  for (const q of p.questions ?? []) {
    if ((q.options?.length ?? 0) < 2) throw new PlanError(`question "${q.question}" needs at least two options`)
    if (!q.options.some((o) => o.label === q.recommended)) throw new PlanError(`question "${q.question}" recommends an option it does not offer`)
  }
}

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }

export interface PlanningContext {
  runId: string; taskId: string; planId: string; appId: string; attempt: number
  input: Omit<ProposeInput, 'onEvent' | 'abort'>
  base: Omit<NewEvent, 'type'>
}

const emit = (e: NewEvent) => db.transaction((tx) => appendEvent(tx, e))

/** Checks the task can be planned, records the run, announces it. Throws PlanError before anything is written. */
export async function preparePlanning(taskId: string, opts: { actor?: string } = {}): Promise<PlanningContext> {
  const [t] = await db.select().from(task).where(eq(task.id, taskId))
  if (!t) throw new PlanError(`no task ${taskId}`)
  const g = (await planGraph(t.planId))!
  const mine = g.phases.filter((x) => x.taskId === taskId)
  if (mine.length) throw new PlanError(`task #${t.number} already has ${mine.length} phase${mine.length > 1 ? 's' : ''}; it is planned`)
  if (!['drafting', 'proposed'].includes(g.plan.status)) throw new PlanError(`plan is ${g.plan.status}; only a draft can be planned`)
  const [a] = await db.select().from(app).where(eq(app.id, t.appId))
  const [r] = await db.select().from(repo).where(eq(repo.appId, t.appId))
  if (!r?.localPath) throw new PlanError(`app ${a.name} has no repo with a local path`)
  const setup = (a.setup ?? {}) as AppSetup
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(run).where(and(eq(run.taskId, taskId), eq(run.kind, 'plan')))
  const attempt = Number(n) + 1
  const runId = newId('run')
  await db.insert(run).values({ id: runId, appId: a.id, taskId, attempt, kind: 'plan', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
  const base: Omit<NewEvent, 'type'> = { workspaceId: a.workspaceId, appId: a.id, planId: t.planId, taskId, runId, actor: opts.actor ?? 'engine' }
  await emit({ ...base, type: 'task.planning', payload: { attempt, number: t.number, title: t.title } })
  const earlier = g.tasks.filter((x) => x.position < t.position).map((x) => ({
    number: x.number, title: x.title, phases: g.phases.filter((p) => p.taskId === x.id).map((p) => ({ number: p.number, title: p.title })),
  }))
  return {
    runId, taskId, planId: t.planId, appId: a.id, attempt, base,
    input: {
      repoPath: r.localPath, task: { number: t.number, title: t.title, brief: t.brief }, plan: { title: g.plan.title, spec: g.plan.spec }, earlier,
      testCmd: setup.test_cmd, model: setup.model, maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
    },
  }
}

export interface PlanningResult {
  status: 'completed' | 'failed'; runId: string; costUsd?: number; error?: string
  phases: { id: string; number: number; title: string }[]
  decisions: (typeof decision.$inferSelect)[]
  questions: (typeof question.$inferSelect)[]
}

/** Runs the planner and writes what it proposed. Never throws: a failure is a failed run and a task.plan_failed event. */
export async function finishPlanning(ctx: PlanningContext, opts: { propose?: Propose; abort?: AbortController } = {}): Promise<PlanningResult> {
  const propose = opts.propose ?? proposeWithAgent
  const onEvent: ProposeInput['onEvent'] = async (type, payload) => { await emit({ ...ctx.base, actor: `agent:${ctx.runId}`, type, payload }) }
  const failed = async (error: string, out?: ProposeOutput): Promise<PlanningResult> => {
    await db.update(run).set({ status: 'failed', endedAt: new Date(), error, costUsd: out?.costUsd?.toString() ?? null, agentSessionId: out?.agentSessionId ?? null }).where(eq(run.id, ctx.runId))
    await emit({ ...ctx.base, type: 'task.plan_failed', payload: { attempt: ctx.attempt, error } })
    return { status: 'failed', runId: ctx.runId, error, costUsd: out?.costUsd, phases: [], decisions: [], questions: [] }
  }
  let out: ProposeOutput
  try { out = await propose({ ...ctx.input, abort: opts.abort, onEvent }) } catch (err: any) { return failed(String(err?.message ?? err).slice(0, 1000)) }
  if (out.status !== 'completed' || !out.proposal) return failed(out.error ?? 'the planner did not finish', out)
  const proposal = out.proposal
  try { validateProposal(proposal) } catch (err: any) { return failed(err.message, out) }

  try {
    const written = await db.transaction(async (tx) => {
      const phases = await addPhases(ctx.taskId, proposal.phases.map((p): NewPhase => ({
        key: p.key, title: p.title, description: p.description?.trim() || undefined, brief: phaseBrief(p), dependsOn: p.depends_on ?? [], files: p.files ?? [],
      })), 'planner', tx)
      const decisions = proposal.decisions.length ? await tx.insert(decision).values(proposal.decisions.map((d) => ({
        id: newId('decision'), appId: ctx.appId, planId: ctx.planId, taskId: ctx.taskId, runId: ctx.runId, question: d.title,
        options: [{ key: 'A', text: d.chosen, recommended: true }, ...d.rejected.map((r, n) => ({ key: String.fromCharCode(66 + n), text: r, recommended: false }))],
        chosen: 'A', provisional: true, rationale: d.reason,
      }))).returning() : []
      const questions = proposal.questions.length ? await tx.insert(question).values(proposal.questions.map((q) => ({
        id: newId('question'), appId: ctx.appId, planId: ctx.planId, taskId: ctx.taskId, runId: ctx.runId, text: q.question,
        options: q.options.map((o) => ({ ...o, recommended: o.label === q.recommended })), reason: q.reason, cost: questionCost(q), status: 'open',
      }))).returning() : []
      for (const q of questions) await appendEvent(tx, { ...ctx.base, type: 'question.asked', payload: { questionId: q.id, text: q.text, cost: q.cost } })
      await tx.update(run).set({
        status: 'completed', endedAt: new Date(), costUsd: out.costUsd?.toString() ?? null, agentSessionId: out.agentSessionId ?? null,
        summary: [proposal.notes?.trim(), `${phases.length} phase(s), ${decisions.length} decision(s), ${questions.length} question(s)`].filter(Boolean).join('\n\n'),
      }).where(eq(run.id, ctx.runId))
      await appendEvent(tx, { ...ctx.base, type: 'task.planned', payload: {
        attempt: ctx.attempt, phases: phases.map((p) => ({ id: p.id, number: p.number, title: p.title })),
        decisions: decisions.length, questions: questions.length, costUsd: out.costUsd ?? null, notes: proposal.notes ?? '',
      } })
      return { phases, decisions, questions }
    })
    return { status: 'completed', runId: ctx.runId, costUsd: out.costUsd, phases: written.phases.map((p) => ({ id: p.id, number: p.number, title: p.title })), decisions: written.decisions, questions: written.questions }
  } catch (err: any) {
    return failed(`the proposal could not be saved: ${err?.message ?? err}`, out)
  }
}

/** The whole thing, for the CLI and tests. */
export async function planTask(taskId: string, opts: { propose?: Propose; actor?: string } = {}) {
  return finishPlanning(await preparePlanning(taskId, opts), opts)
}

/** After a restart: a planner run that was working is gone; say so, and the task can be planned again. */
export async function recoverPlanning() {
  const stranded = await db.select().from(run).where(and(eq(run.kind, 'plan'), eq(run.status, 'working')))
  for (const r of stranded) {
    await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'engine restarted' }).where(eq(run.id, r.id))
    const [t] = r.taskId ? await db.select().from(task).where(eq(task.id, r.taskId)) : []
    if (!t) continue
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    await emit({ workspaceId: a.workspaceId, appId: a.id, planId: t.planId, taskId: t.id, runId: r.id, actor: 'engine', type: 'task.plan_failed', payload: { attempt: r.attempt, error: 'engine restarted while planning' } })
  }
  return stranded.length
}

/** A person answers a question. (A late answer that disagrees with what was built opens a follow-on; that comes with follow-ups.) */
export async function answerQuestion(questionId: string, answer: string, actor = 'user') {
  const [q] = await db.select().from(question).where(eq(question.id, questionId))
  if (!q) throw new PlanError(`no question ${questionId}`)
  const [row] = await db.update(question).set({ status: 'answered', answer, answeredBy: actor, answeredAt: new Date() }).where(eq(question.id, questionId)).returning()
  const [t] = q.taskId ? await db.select().from(task).where(eq(task.id, q.taskId)) : []
  if (t) {
    const [a] = await db.select().from(app).where(eq(app.id, t.appId))
    await emit({ workspaceId: a.workspaceId, appId: a.id, planId: t.planId, taskId: t.id, actor, type: 'question.answered', payload: { questionId, answer } })
  }
  return row
}
