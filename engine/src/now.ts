/**
 * The front door: what is running, what needs a person, what just happened. Nothing here has state of its own;
 * it is all read from the plan, task, phase, question, pr, run, step and event tables, so it is always true.
 */
import { and, desc, eq, inArray, ne, notInArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, event, phase, plan, pr, question, run, step, task } from './db/schema.js'

const LIVE = ['running', 'merging', 'testing', 'awaiting_answer']
const NOISE = ['run.tool_call', 'run.tool_result', 'run.rate_limit', 'run.message', 'talk.message', 'talk.permission', 'talk.result'] // conversations have their own place

export type Attention =
  | { kind: 'failed_phase'; planId: string; planTitle: string; appName: string; phaseId: string; number: number; title: string; error: string | null }
  | { kind: 'question'; planId: string; planTitle: string; appName: string; questionId: string; taskNumber: number | null; text: string; cost: string | null; askedAt: Date }
  | { kind: 'run_plan'; planId: string; planTitle: string; appName: string; phases: number }
  | { kind: 'plan_task'; planId: string; planTitle: string; appName: string; taskId: string; taskNumber: number; taskTitle: string }
  | { kind: 'merge_pr'; planId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null }

export async function now(appId?: string) {
  const plans = await db.select().from(plan).where(appId ? and(ne(plan.status, 'superseded'), eq(plan.appId, appId)) : ne(plan.status, 'superseded')).orderBy(desc(plan.createdAt))
  const apps = await db.select().from(app)
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? '?'
  const planIds = plans.map((p) => p.id)
  const tasks = planIds.length ? await db.select().from(task).where(inArray(task.planId, planIds)) : []
  const phases = planIds.length ? await db.select().from(phase).where(inArray(phase.planId, planIds)) : []
  const questions = planIds.length ? await db.select().from(question).where(and(inArray(question.planId, planIds), eq(question.status, 'open'))) : []
  const prs = planIds.length ? await db.select().from(pr).where(inArray(pr.planId, planIds)) : []
  const phaseIds = phases.map((x) => x.id)
  const runs = phaseIds.length ? await db.select().from(run).where(inArray(run.phaseId, phaseIds)) : []
  const steps = phaseIds.length ? await db.select().from(step).where(inArray(step.phaseId, phaseIds)) : []
  const recent = await db.select().from(event).where(appId ? and(notInArray(event.type, NOISE), eq(event.appId, appId)) : notInArray(event.type, NOISE)).orderBy(desc(event.seq)).limit(30)

  const lastRun = (phaseId: string) => runs.filter((r) => r.phaseId === phaseId).sort((a, b) => b.attempt - a.attempt)[0]
  const currentStep = (phaseId: string) => {
    const r = lastRun(phaseId)
    return r ? steps.find((s) => s.phaseId === phaseId && s.runId === r.id && s.status === 'in_progress')?.text ?? null : null
  }
  const tag = (p: typeof plans[number]) => ({ planId: p.id, planTitle: p.title, appName: appName(p.appId) })

  const running = plans.filter((p) => p.status === 'running').map((p) => {
    const mine = phases.filter((x) => x.planId === p.id)
    const thePr = prs.find((q) => q.planId === p.id)
    return {
      ...tag(p), status: p.status, integrationBranch: p.integrationBranch,
      phases: { total: mine.length, done: mine.filter((x) => x.status === 'done').length, failed: mine.filter((x) => x.status === 'failed').length },
      live: mine.filter((x) => LIVE.includes(x.status)).map((x) => ({ id: x.id, number: x.number, title: x.title, status: x.status, step: currentStep(x.id) })),
      held: mine.filter((x) => x.status === 'queued' && x.heldReason).map((x) => ({ id: x.id, number: x.number, title: x.title, reason: x.heldReason })),
      pr: thePr ? { number: thePr.number, url: thePr.url, status: thePr.status } : null,
    }
  })

  const needsYou: Attention[] = []
  for (const p of plans) {
    const mine = phases.filter((x) => x.planId === p.id)
    for (const x of mine.filter((x) => x.status === 'failed')) {
      needsYou.push({ kind: 'failed_phase', ...tag(p), phaseId: x.id, number: x.number, title: x.title, error: lastRun(x.id)?.error ?? x.heldReason ?? null })
    }
  }
  for (const q of questions) {
    const p = plans.find((x) => x.id === q.planId)!
    const t = tasks.find((x) => x.id === q.taskId)
    needsYou.push({ kind: 'question', ...tag(p), questionId: q.id, taskNumber: t?.number ?? null, text: q.text, cost: q.cost, askedAt: q.askedAt })
  }
  for (const p of plans.filter((x) => ['drafting', 'proposed', 'approved'].includes(x.status))) {
    const myTasks = tasks.filter((t) => t.planId === p.id).sort((a, b) => a.position - b.position)
    const unplanned = myTasks.filter((t) => !phases.some((x) => x.taskId === t.id))
    const open = questions.filter((q) => q.planId === p.id).length
    if (!unplanned.length && myTasks.length && !open) needsYou.push({ kind: 'run_plan', ...tag(p), phases: phases.filter((x) => x.planId === p.id).length })
    else if (unplanned.length) needsYou.push({ kind: 'plan_task', ...tag(p), taskId: unplanned[0].id, taskNumber: unplanned[0].number, taskTitle: unplanned[0].title })
  }
  for (const p of plans.filter((x) => x.status === 'landed')) {
    const thePr = prs.find((q) => q.planId === p.id)
    if (thePr && thePr.status === 'open') needsYou.push({ kind: 'merge_pr', ...tag(p), prNumber: thePr.number, url: thePr.url })
  }

  return { running, needsYou, recent: recent.reverse(), counts: { plans: plans.length, running: running.length, needsYou: needsYou.length } }
}
