/**
 * The front door: what is running, what needs a person, what just happened. Nothing here has state of its own;
 * it is all read from the project, task, phase, question, pr, run, step and event tables, so it is always true.
 */
import { and, desc, eq, inArray, ne, notInArray } from 'drizzle-orm'
import { db } from './db/client.js'
import { app, event, phase, project, pr, question, run, step, task } from './db/schema.js'

const LIVE = ['running', 'merging', 'testing', 'awaiting_answer']
const NOISE = ['run.tool_call', 'run.tool_result', 'run.rate_limit', 'run.message', 'talk.message', 'talk.permission', 'talk.result'] // conversations have their own place

export type Attention =
  | { kind: 'failed_phase'; projectId: string; planTitle: string; appName: string; phaseId: string; number: number; title: string; error: string | null }
  | { kind: 'question'; projectId: string; planTitle: string; appName: string; questionId: string; taskNumber: number | null; text: string; cost: string | null; askedAt: Date }
  | { kind: 'run_project'; projectId: string; planTitle: string; appName: string; phases: number }
  | { kind: 'plan_task'; projectId: string; planTitle: string; appName: string; taskId: string; taskNumber: number; taskTitle: string }
  | { kind: 'merge_pr'; projectId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null }

export async function now(appId?: string) {
  const projects = await db.select().from(project).where(appId ? and(ne(project.status, 'superseded'), eq(project.appId, appId)) : ne(project.status, 'superseded')).orderBy(desc(project.createdAt))
  const apps = await db.select().from(app)
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? '?'
  const projectIds = projects.map((p) => p.id)
  const tasks = projectIds.length ? await db.select().from(task).where(inArray(task.projectId, projectIds)) : []
  const phases = projectIds.length ? await db.select().from(phase).where(inArray(phase.projectId, projectIds)) : []
  const questions = projectIds.length ? await db.select().from(question).where(and(inArray(question.projectId, projectIds), eq(question.status, 'open'))) : []
  const prs = projectIds.length ? await db.select().from(pr).where(inArray(pr.projectId, projectIds)) : []
  const phaseIds = phases.map((x) => x.id)
  const runs = phaseIds.length ? await db.select().from(run).where(inArray(run.phaseId, phaseIds)) : []
  const steps = phaseIds.length ? await db.select().from(step).where(inArray(step.phaseId, phaseIds)) : []
  const recent = await db.select().from(event).where(appId ? and(notInArray(event.type, NOISE), eq(event.appId, appId)) : notInArray(event.type, NOISE)).orderBy(desc(event.seq)).limit(30)

  const lastRun = (phaseId: string) => runs.filter((r) => r.phaseId === phaseId).sort((a, b) => b.attempt - a.attempt)[0]
  const currentStep = (phaseId: string) => {
    const r = lastRun(phaseId)
    return r ? steps.find((s) => s.phaseId === phaseId && s.runId === r.id && s.status === 'in_progress')?.text ?? null : null
  }
  const tag = (p: typeof projects[number]) => ({ projectId: p.id, planTitle: p.title, appName: appName(p.appId) })

  const running = projects.filter((p) => p.status === 'running' || p.status === 'paused').map((p) => {
    const mine = phases.filter((x) => x.projectId === p.id)
    const thePr = prs.find((q) => q.projectId === p.id)
    return {
      ...tag(p), status: p.status, integrationBranch: p.integrationBranch,
      phases: { total: mine.length, done: mine.filter((x) => x.status === 'done').length, failed: mine.filter((x) => x.status === 'failed').length },
      live: mine.filter((x) => LIVE.includes(x.status)).map((x) => ({ id: x.id, number: x.number, title: x.title, status: x.status, step: currentStep(x.id) })),
      held: mine.filter((x) => x.status === 'queued' && x.heldReason).map((x) => ({ id: x.id, number: x.number, title: x.title, reason: x.heldReason })),
      pr: thePr ? { number: thePr.number, url: thePr.url, status: thePr.status } : null,
    }
  })

  const needsYou: Attention[] = []
  for (const p of projects) {
    const mine = phases.filter((x) => x.projectId === p.id)
    for (const x of mine.filter((x) => x.status === 'failed')) {
      needsYou.push({ kind: 'failed_phase', ...tag(p), phaseId: x.id, number: x.number, title: x.title, error: lastRun(x.id)?.error ?? x.heldReason ?? null })
    }
  }
  for (const q of questions) {
    const p = projects.find((x) => x.id === q.projectId)!
    const t = tasks.find((x) => x.id === q.taskId)
    needsYou.push({ kind: 'question', ...tag(p), questionId: q.id, taskNumber: t?.number ?? null, text: q.text, cost: q.cost, askedAt: q.askedAt })
  }
  for (const p of projects.filter((x) => ['drafting', 'proposed', 'approved'].includes(x.status))) {
    const myTasks = tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.position - b.position)
    const unplanned = myTasks.filter((t) => !phases.some((x) => x.taskId === t.id))
    const open = questions.filter((q) => q.projectId === p.id).length
    if (!unplanned.length && myTasks.length && !open) needsYou.push({ kind: 'run_project', ...tag(p), phases: phases.filter((x) => x.projectId === p.id).length })
    else if (unplanned.length) needsYou.push({ kind: 'plan_task', ...tag(p), taskId: unplanned[0].id, taskNumber: unplanned[0].number, taskTitle: unplanned[0].title })
  }
  for (const p of projects.filter((x) => x.status === 'landed')) {
    const thePr = prs.find((q) => q.projectId === p.id)
    if (thePr && thePr.status === 'open') needsYou.push({ kind: 'merge_pr', ...tag(p), prNumber: thePr.number, url: thePr.url })
  }

  return { running, needsYou, recent: recent.reverse(), counts: { projects: projects.length, running: running.length, needsYou: needsYou.length } }
}
