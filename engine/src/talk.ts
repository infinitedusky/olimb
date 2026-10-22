/**
 * Talk: an interactive agent session the engine owns. The same Claude Code the planner and the builders run, with
 * a person on the other end. The conversation is rows and events (so it survives a restart and shows on any
 * page); the engine's own API is the agent's MCP tools; an edit or a shell command waits for the person's yes in
 * the UI, Claude Code's default mode. Development runs on the operator's login, the product on an API key.
 */
import { createSdkMcpServer, query, tool, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db/client.js'
import { app, repo, session, sessionMessage, workspace } from './db/schema.js'
import { appendEvent } from './events.js'
import { newId } from './ids.js'
import { createIdea, listIdeas } from './ideas.js'
import { now } from './now.js'
import { answerQuestion, finishPlanning, preparePlanning } from './planner.js'
import { createPlan, listPlans, PlanError, planGraph } from './plans.js'
import { runner } from './runner.js'
import { eventsSince } from './events.js'

const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'WebFetch', 'WebSearch']
const ASK_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash']
const PERMISSION_TIMEOUT_MS = 10 * 60_000

const TALK_PROMPT = `You are Self Evident's agent (Self Evident: software that proves itself — observe, learn, ideate, mockup, build), talking with the person who runs it, in its own web UI.
The factory builds software from ideas: idea → plan (tasks in order) → task (a title and a brief) → phase (one agent, one worktree, one commit) → step. Read CLAUDE.md, LOG.md and SHAPE.md in this checkout when you need the history; LOG.md's top entries are the latest decisions.
You have the engine as tools (mcp__engine__*): see what needs attention, keep ideas, make plans, run the planner on a task, answer its questions, start or cancel plans, read the event log. Use them rather than describing what the person should click.
You can read, search and edit files and run commands here, as in any Claude Code session. Every edit and command is shown to the person for approval before it runs; keep them small and say what each is for.
How this person works: PRs only, main is production; short answers that lead with the answer; questions are questions, not instructions to change things; give a recommendation, not a survey; write decisions into LOG.md or SHAPE.md the moment they are made; one git worktree per branch, never the main checkout.`

interface Pending { resolve: (v: { allow: boolean; always?: boolean }) => void; tool: string }
interface Live { q: Query; push: (m: SDKUserMessage) => void; close: () => void; pending: Map<string, Pending>; always: Set<string>; busy: boolean }
const live = new Map<string, Live>()

function inputQueue() {
  const buf: SDKUserMessage[] = []
  let wake: (() => void) | null = null
  let closed = false
  const it = (async function* () {
    while (!closed) {
      if (buf.length) yield buf.shift()!
      else await new Promise<void>((r) => { wake = r })
    }
  })()
  return { it, push: (m: SDKUserMessage) => { buf.push(m); wake?.(); wake = null }, close: () => { closed = true; wake?.(); wake = null } }
}

const clip = (s: unknown, n = 600) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t && t.length > n ? t.slice(0, n) + '…' : (t ?? '') }
const summariseInput = (name: string, input: any) => {
  switch (name) {
    case 'Bash': return { command: clip(input?.command, 400) }
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit': return { file: input?.file_path, ...(name === 'Edit' ? { old: clip(input?.old_string, 200), new: clip(input?.new_string, 200) } : {}), ...(name === 'Write' ? { bytes: String(input?.content ?? '').length } : {}) }
    case 'Glob': case 'Grep': return { pattern: input?.pattern, path: input?.path }
    default: return { input: clip(input, 400) }
  }
}

/** The engine, as tools. Thin wrappers over the same functions the routes call. */
function engineTools() {
  const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
  const tryIt = async (fn: () => Promise<unknown>) => { try { return text(await fn()) } catch (err: any) { return { ...text(`error: ${err?.message ?? err}`), isError: true } } }
  return createSdkMcpServer({
    name: 'engine', version: '0.1.0',
    instructions: 'The Self Evident engine. Plans are tasks in order; tasks become phases through the planner; phases run as agents in worktrees and land into the plan\'s branch and PR.',
    tools: [
      tool('now', 'What is running, what needs a person, what just happened.', {}, async () => tryIt(now)),
      tool('plans', 'Every plan with its app and counts (superseded hidden unless all=true).', { all: z.boolean().optional() }, async (a) => tryIt(() => listPlans({ all: a.all }))),
      tool('plan_graph', 'A plan in full: tasks in order, phases with dependencies, files, held reasons, steps and last run; the planner\'s decisions and questions.', { planId: z.string() }, async (a) => tryIt(() => planGraph(a.planId))),
      tool('ideas', 'The ideas inbox and what left it.', {}, async () => tryIt(listIdeas)),
      tool('create_idea', 'Keep an idea: a title and, optionally, why and what is already decided.', { appId: z.string(), title: z.string(), body: z.string().optional() }, async (a) => tryIt(() => createIdea({ ...a, actor: 'agent' }))),
      tool('create_plan', 'Create a plan: tasks in order, each a title and a brief. Phases come from the planner (plan_task) or can be given.', {
        appId: z.string(), title: z.string(), spec: z.string().optional(), ideaId: z.string().optional(),
        tasks: z.array(z.object({ title: z.string(), brief: z.string().optional(), phases: z.array(z.object({ key: z.string(), title: z.string(), brief: z.string().optional(), dependsOn: z.array(z.string()).optional(), files: z.array(z.string()).optional() })).optional() })),
      }, async (a) => tryIt(() => createPlan(a))),
      tool('plan_task', 'Run the planner on a task (minutes): reads the repo and the brief, writes phases, decisions and questions. Returns when done.', { taskId: z.string() }, async (a) => tryIt(async () => finishPlanning(await preparePlanning(a.taskId, { actor: 'agent' })))),
      tool('answer_question', 'Answer one of the planner\'s questions on the person\'s behalf; say so to them first.', { questionId: z.string(), answer: z.string() }, async (a) => tryIt(() => answerQuestion(a.questionId, a.answer, 'agent'))),
      tool('start_plan', 'Run a plan: integration branch, a worktree and an agent per phase, landing, PR.', { planId: z.string() }, async (a) => tryIt(() => runner.startPlan(a.planId))),
      tool('cancel_plan', 'Stop a plan: agents aborted, unlanded phases cancelled, landed work kept.', { planId: z.string() }, async (a) => tryIt(() => runner.cancelPlan(a.planId))),
      tool('events', 'The event log, newest last. Filter by plan or phase; since is a sequence number.', { planId: z.string().optional(), phaseId: z.string().optional(), since: z.number().optional(), limit: z.number().optional() },
        async (a) => tryIt(async () => (await eventsSince(a.since ?? 0, { planId: a.planId, phaseId: a.phaseId })).slice(-(a.limit ?? 50)))),
    ],
  })
}

async function workspaceFor(appId: string) {
  const [a] = await db.select().from(app).where(eq(app.id, appId))
  if (a) return a.workspaceId
  const [w] = await db.select().from(workspace).limit(1)
  return w?.id ?? 'ws_none'
}

/** One transcript row, and the event that tells every open page about it. */
async function record(sessionId: string, author: string, kind: string, body: string, payload?: Record<string, unknown>) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  const workspaceId = await workspaceFor(s.appId)
  const [row] = await db.insert(sessionMessage).values({ appId: s.appId, sessionId, author, kind, body, payload: payload ?? null, status: 'sent', sentAt: new Date() }).returning()
  await db.update(session).set({ lastActiveAt: new Date() }).where(eq(session.id, sessionId))
  await db.transaction((tx) => appendEvent(tx, {
    workspaceId, appId: s.appId, sessionId, actor: author === 'user' ? 'user' : `agent:${sessionId}`,
    type: kind === 'permission' ? 'talk.permission' : kind === 'result' ? 'talk.result' : 'talk.message',
    payload: { sessionId, messageId: row.id, author, kind, body: clip(body, 200), ...(payload ?? {}) },
  }))
  return row
}

export async function startTalk(input: { appId: string; cwd?: string; title?: string; actor?: string }) {
  const [a] = await db.select().from(app).where(eq(app.id, input.appId))
  if (!a) throw new PlanError(`no app ${input.appId}`)
  let cwd = input.cwd
  if (!cwd) { const [r] = await db.select().from(repo).where(eq(repo.appId, input.appId)); cwd = r?.localPath ?? undefined }
  if (!cwd) throw new PlanError(`${a.name} has no local checkout yet; add its repo in Settings`)
  const [row] = await db.insert(session).values({ id: newId('session'), appId: a.id, kind: 'talk', cwd, title: input.title ?? null, createdBy: input.actor ?? 'user', lastActiveAt: new Date() }).returning()
  return row
}

/** The one open conversation for an app: found, or started. */
export async function currentTalk(appId: string, actor = 'user') {
  const [row] = await db.select().from(session)
    .where(and(eq(session.kind, 'talk'), eq(session.status, 'open'), eq(session.appId, appId)))
    .orderBy(desc(session.lastActiveAt)).limit(1)
  return row ?? startTalk({ appId, actor })
}

export const listTalks = async () => {
  const rows = await db.select().from(session).where(eq(session.kind, 'talk')).orderBy(desc(session.lastActiveAt))
  const counts = await db.select({ sessionId: sessionMessage.sessionId, n: sql<number>`count(*)` }).from(sessionMessage).groupBy(sessionMessage.sessionId)
  const n = new Map(counts.map((c) => [c.sessionId, Number(c.n)]))
  return rows.map((s) => ({ ...s, live: live.has(s.id), busy: live.get(s.id)?.busy ?? false, messages: n.get(s.id) ?? 0 }))
}

export async function talkTranscript(sessionId: string) {
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  const messages = await db.select().from(sessionMessage).where(eq(sessionMessage.sessionId, sessionId)).orderBy(sessionMessage.id)
  const l = live.get(sessionId)
  return { session: { ...s, live: !!l, busy: l?.busy ?? false }, messages, pending: l ? [...l.pending.keys()] : [] }
}

/** Open (or reopen, resuming the SDK session) the live conversation behind a session row. */
async function open(sessionId: string): Promise<Live> {
  const existing = live.get(sessionId)
  if (existing) return existing
  const [s] = await db.select().from(session).where(eq(session.id, sessionId))
  if (!s) throw new PlanError(`no session ${sessionId}`)
  if (s.status === 'ended') throw new PlanError('this conversation has ended')
  const [a] = s.appId ? await db.select().from(app).where(eq(app.id, s.appId)) : []
  const setup = (a?.setup ?? {}) as { model?: string }
  const input = inputQueue()
  const entry: Live = { q: null as unknown as Query, push: input.push, close: input.close, pending: new Map(), always: new Set(), busy: false }
  const q = query({
    prompt: input.it,
    options: {
      cwd: s.cwd!,
      resume: s.agentSessionId ?? undefined,
      model: setup.model,
      settingSources: ['project'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: TALK_PROMPT },
      mcpServers: { engine: engineTools() },
      tools: [...READ_TOOLS, ...ASK_TOOLS],
      allowedTools: [...READ_TOOLS, 'mcp__engine'],
      permissionMode: 'default',
      canUseTool: async (toolName, toolInput) => {
        if (READ_TOOLS.includes(toolName) || toolName.startsWith('mcp__engine__')) return { behavior: 'allow', updatedInput: toolInput }
        if (entry.always.has(toolName)) return { behavior: 'allow', updatedInput: toolInput }
        const requestId = newId('run')
        const summary = summariseInput(toolName, toolInput)
        await record(sessionId, 'engine', 'permission', `${toolName}: may I?`, { requestId, tool: toolName, input: summary })
        const answer = await new Promise<{ allow: boolean; always?: boolean }>((resolveP) => {
          entry.pending.set(requestId, { resolve: resolveP, tool: toolName })
          setTimeout(() => { if (entry.pending.delete(requestId)) resolveP({ allow: false }) }, PERMISSION_TIMEOUT_MS)
        })
        if (answer.always) entry.always.add(toolName)
        await record(sessionId, 'user', 'text', answer.allow ? `Allowed ${toolName}${answer.always ? ' for this conversation' : ''}.` : `Denied ${toolName}.`, { requestId, decision: answer.allow ? 'allow' : 'deny' })
        return answer.allow ? { behavior: 'allow', updatedInput: toolInput } : { behavior: 'deny', message: 'The person said no. Ask what they would prefer.' }
      },
    },
  })
  entry.q = q
  live.set(sessionId, entry)
  void (async () => {
    try { for await (const m of q) await handle(sessionId, entry, m) }
    catch (err: any) { await record(sessionId, 'engine', 'error', clip(err?.message ?? String(err), 1000)).catch(() => {}) }
    finally { live.delete(sessionId); entry.busy = false }
  })()
  return entry
}

async function handle(sessionId: string, entry: Live, m: SDKMessage) {
  const a = m as any
  switch (m.type) {
    case 'system':
      if (a.subtype === 'init') await db.update(session).set({ agentSessionId: a.session_id }).where(eq(session.id, sessionId))
      return
    case 'assistant':
      for (const block of a.message?.content ?? []) {
        if (block.type === 'text' && block.text?.trim()) await record(sessionId, 'agent', 'text', block.text)
        else if (block.type === 'tool_use') await record(sessionId, 'tool', 'tool_call', block.name, { tool: block.name, input: summariseInput(block.name, block.input), toolUseId: block.id })
      }
      return
    case 'user':
      for (const block of a.message?.content ?? []) {
        if (block?.type === 'tool_result') {
          const text = Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('\n') : String(block.content ?? '')
          await record(sessionId, 'tool', 'tool_result', clip(text, 1500), { ok: !block.is_error, toolUseId: block.tool_use_id })
        }
      }
      return
    case 'result':
      entry.busy = false
      await record(sessionId, 'engine', 'result', a.subtype === 'success' ? 'done' : `${a.subtype}`, { subtype: a.subtype, costUsd: a.total_cost_usd, turns: a.num_turns, durationMs: a.duration_ms })
      return
  }
}

export interface TalkContext { path: string; label?: string; planId?: string; appId?: string; ideaId?: string }

/** Where the person is, as one line the agent can act on. The transcript keeps the plain text; only the agent sees this. */
async function describeContext(c?: TalkContext): Promise<string> {
  if (!c?.path) return ''
  const bits = [`the page ${c.path}`]
  if (c.planId) {
    const g = await planGraph(c.planId).catch(() => null)
    if (g) bits.push(`plan ${c.planId} "${g.plan.title}" (${g.plan.status}; ${g.tasks.length} task(s), ${g.phases.length} phase(s), ${g.questions.filter((q) => q.status === 'open').length} open question(s))`)
  }
  if (c.appId) bits.push(`app ${c.appId}`)
  if (c.ideaId) bits.push(`idea ${c.ideaId}`)
  return `(The person is looking at ${bits.join(', ')}. "This" means that unless they say otherwise; use the engine tools for details.)\n\n`
}

export async function say(sessionId: string, text: string, context?: TalkContext) {
  if (!text.trim()) throw new PlanError('say something')
  const l = await open(sessionId)
  const row = await record(sessionId, 'user', 'text', text.trim(), context ? { context } : undefined)
  l.busy = true
  l.push({ type: 'user', message: { role: 'user', content: (await describeContext(context)) + text.trim() }, parent_tool_use_id: null })
  return { messageId: row.id }
}

export async function answerPermission(sessionId: string, requestId: string, allow: boolean, always = false) {
  const l = live.get(sessionId)
  const p = l?.pending.get(requestId)
  if (!l || !p) throw new PlanError('nothing is waiting for that answer')
  l.pending.delete(requestId)
  p.resolve({ allow, always })
  return { ok: true }
}

export async function interruptTalk(sessionId: string) {
  const l = live.get(sessionId)
  if (!l) return { interrupted: false }
  await l.q.interrupt().catch(() => {})
  l.busy = false
  return { interrupted: true }
}

export async function endTalk(sessionId: string) {
  const l = live.get(sessionId)
  if (l) { l.close(); await l.q.interrupt().catch(() => {}); live.delete(sessionId) }
  await db.update(session).set({ status: 'ended' }).where(eq(session.id, sessionId))
  return { ended: true }
}

/** On shutdown: close the live conversations; they resume from their SDK session ids on the next message. */
export function closeTalks() { for (const [, l] of live) l.close(); live.clear() }
