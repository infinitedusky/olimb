/**
 * The runner: starts a plan, dispatches ready tasks into worktrees and agent runs (as many as the cap allows),
 * lands what finishes one at a time, retries what doesn't, keeps the plan's PR current, cleans up when the plan
 * lands, and recovers after a restart. One process; all state in Postgres; this is the single writer.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from './db/client.js'
import { app, event, plan, pr as prTable, repo, run, task } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { runTask, type Execute } from './executor.js'
import { addWorktree, ensureBranch, git, headSha, removeWorktree } from './git.js'
import { newId } from './ids.js'
import { land, withLock } from './landing.js'
import { ensurePlanPr, prBody } from './pr.js'
import { planGraph, PlanError, tick } from './plans.js'
import { reapAgentProcesses } from './reap.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }

export class Runner {
  private active = new Map<string, AbortController>() // task id → abort for its live run
  private execute: Execute
  private sessionsMax: number

  constructor(opts: { execute?: Execute; sessionsMax?: number } = {}) {
    this.execute = opts.execute ?? runTask
    this.sessionsMax = opts.sessionsMax ?? SESSIONS_MAX
  }

  async startPlan(planId: string) {
    const ctx = await this.context(planId)
    const { p, a, r } = ctx
    if (!r) throw new PlanError(`app ${a.name} has no repo with a local path`)
    const sha = await ensureBranch(r.localPath!, p.integrationBranch!, a.defaultBranch)
    await db.update(plan).set({ status: 'running' }).where(eq(plan.id, planId))
    await this.emit({ ...ctx.base, type: 'plan.started', payload: { integrationBranch: p.integrationBranch, from: a.defaultBranch, sha } })
    void this.dispatch(planId)
    return { integrationBranch: p.integrationBranch, sha }
  }

  /** One dispatch pass, serialized per plan: tick, launch what became ready, close the plan when all is landed. */
  dispatch(planId: string): Promise<void> {
    return withLock(`dispatch:${planId}`, async () => {
      const room = Math.max(0, this.sessionsMax - this.active.size)
      await tick(planId, room)
      const g = (await planGraph(planId))!
      for (const t of g.tasks) {
        if (t.status === 'ready' && !this.active.has(t.id)) {
          this.active.set(t.id, new AbortController())
          this.launch(t.id, planId).catch(async (err) => {
            this.active.delete(t.id)
            await this.emit({ ...(await this.context(planId)).base, taskId: t.id, type: 'task.error', payload: { error: String(err?.message ?? err) } })
          })
        }
      }
      if (g.tasks.length && g.tasks.every((t) => t.status === 'done') && g.plan.status === 'running') {
        await db.update(plan).set({ status: 'landed' }).where(eq(plan.id, planId))
        await this.emit({ ...(await this.context(planId)).base, type: 'plan.landed', payload: {} })
        await this.cleanup(planId)
      }
    })
  }

  private async launch(taskId: string, planId: string) {
    const ctx = await this.context(planId)
    const { p, a, r, base } = ctx
    const setup = (a.setup ?? {}) as AppSetup
    const [t] = await db.select().from(task).where(eq(task.id, taskId))
    const g = (await planGraph(planId))!
    const files = g.tasks.find((x) => x.id === taskId)!.files
    const branch = t.branch ?? `task/${p.id}/${t.number}`
    const worktreePath = t.worktreePath ?? join(`${r!.localPath}-worktrees`, `${p.id}--${t.number}`)
    // Worktree and branch creation touch the repo's refs: one at a time per repo. A failure here is an attempt too.
    let baseSha: string
    try {
      baseSha = await withLock(`git:${r!.localPath}`, async () => {
        await addWorktree(r!.localPath!, worktreePath, branch, p.integrationBranch!)
        return headSha(r!.localPath!, p.integrationBranch!)
      })
    } catch (err: any) {
      const attempt = t.attempt + 1
      await db.update(task).set({ attempt, branch, worktreePath, updatedAt: new Date() }).where(eq(task.id, taskId))
      return this.failed(taskId, planId, attempt, t.maxAttempts, `could not prepare the worktree: ${err?.message ?? err}`, { ...base, taskId })
    }

    const [interrupted] = await db.select().from(run).where(and(eq(run.taskId, taskId), eq(run.status, 'interrupted'))).orderBy(desc(run.attempt)).limit(1)
    const previousFailure = await this.lastFailure(taskId)
    const attempt = t.attempt + 1
    await db.update(task).set({ status: 'running', attempt, branch, worktreePath, baseSha, heldReason: null, updatedAt: new Date() }).where(eq(task.id, taskId))
    const runId = newId('run')
    await db.insert(run).values({ id: runId, taskId, attempt, kind: 'build', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
    const tb = { ...base, taskId, runId }
    await this.emit({ ...tb, type: 'task.status', payload: { from: t.status, to: 'running', attempt, branch, worktreePath, resumes: interrupted?.agentSessionId ?? null } })

    const result = await this.execute({
      task: { id: t.id, number: t.number, title: t.title, brief: t.brief }, worktreePath, branch, files,
      testCmd: setup.test_cmd, previousFailure, model: setup.model, maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
      resumeSessionId: interrupted?.agentSessionId ?? undefined, abort: this.active.get(taskId),
      onEvent: async (type, payload) => { await this.emit({ ...tb, actor: `agent:${runId}`, type, payload }) },
    })
    await db.update(run).set({
      status: result.status, endedAt: new Date(), agentSessionId: result.agentSessionId ?? null,
      costUsd: result.costUsd?.toString() ?? null, summary: result.summary ?? null, error: result.error ?? null,
    }).where(eq(run.id, runId))

    if (result.status !== 'completed') return this.failed(taskId, planId, attempt, t.maxAttempts, `the run ${result.error ?? 'failed'}`, tb)

    await db.update(task).set({ status: 'merging', updatedAt: new Date() }).where(eq(task.id, taskId))
    await this.emit({ ...tb, type: 'task.status', payload: { from: 'running', to: 'merging' } })
    const landed = await withLock(`land:${planId}`, () => land({
      repoPath: r!.localPath!, worktreePath, integrationBranch: p.integrationBranch!, testCmd: setup.test_cmd,
      onEvent: async (type, payload) => { await this.emit({ ...tb, type, payload }) },
    }))
    if (!landed.ok) return this.failed(taskId, planId, attempt, t.maxAttempts, `landing failed at ${landed.stage}: ${landed.detail}`, tb)

    await db.update(task).set({ status: 'done', updatedAt: new Date() }).where(eq(task.id, taskId))
    await this.emit({ ...tb, type: 'task.status', payload: { from: 'merging', to: 'done', sha: landed.sha } })
    await withLock(`land:${planId}`, () => this.updatePr(planId)).catch((err) => this.emit({ ...tb, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
    this.active.delete(taskId)
    await this.dispatch(planId)
  }

  private async failed(taskId: string, planId: string, attempt: number, max: number, why: string, tb: Omit<NewEvent, 'type'>) {
    const again = attempt < max
    await db.update(task).set({ status: again ? 'queued' : 'failed', heldReason: again ? `attempt ${attempt} failed; will retry` : why.slice(0, 500), updatedAt: new Date() }).where(eq(task.id, taskId))
    await this.emit({ ...tb, type: again ? 'task.retry' : 'task.failed', payload: { attempt, max, why: why.slice(0, 2000) } })
    this.active.delete(taskId)
    await this.dispatch(planId)
  }

  /** The last failure reason comes from the log, so it survives a restart. (A landed task never retries again.) */
  private async lastFailure(taskId: string): Promise<string | undefined> {
    const [e] = await db.select().from(event).where(and(eq(event.taskId, taskId), eq(event.type, 'task.retry'))).orderBy(desc(event.seq)).limit(1)
    return e ? String((e.payload as any).why ?? '') : undefined
  }

  /** After a plan lands: remove its task worktrees and local task branches. The integration branch stays (it's the PR). */
  private async cleanup(planId: string) {
    const { p, r, base } = await this.context(planId)
    if (!r) return
    const tasks = await db.select().from(task).where(eq(task.planId, planId))
    await withLock(`git:${r.localPath}`, async () => {
      for (const t of tasks) {
        if (t.worktreePath) await removeWorktree(r.localPath!, t.worktreePath)
        if (t.branch) await git(r.localPath!, ['branch', '-D', t.branch], { allowFail: true })
      }
    })
    await db.update(task).set({ worktreePath: null }).where(eq(task.planId, planId))
    await this.emit({ ...base, type: 'plan.cleaned', payload: { worktrees: tasks.filter((t) => t.worktreePath).length, integrationBranch: p.integrationBranch } })
  }

  /** On startup: reap stray agents, mark their runs interrupted, re-queue their tasks, and resume running plans. */
  async recover() {
    const running = await db.select().from(plan).where(eq(plan.status, 'running'))
    const repos = await db.select().from(repo)
    const roots = repos.filter((x) => x.localPath).map((x) => `${x.localPath}-worktrees`)
    const reaped = await reapAgentProcesses(roots)
    const stuck = await db.select().from(task).where(inArray(task.status, ['running', 'merging', 'testing']))
    for (const t of stuck) {
      await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'engine restarted' }).where(and(eq(run.taskId, t.id), eq(run.status, 'working')))
      await db.update(task).set({ status: 'queued', heldReason: 'interrupted by a restart; will resume', updatedAt: new Date() }).where(eq(task.id, t.id))
      const { base } = await this.context(t.planId!)
      await this.emit({ ...base, taskId: t.id, type: 'task.interrupted', payload: { was: t.status, reaped: reaped.filter((x) => t.worktreePath && x.cwd.startsWith(t.worktreePath)).map((x) => x.pid) } })
    }
    for (const p of running) void this.dispatch(p.id)
    return { plans: running.length, tasks: stuck.length, reaped: reaped.length }
  }

  /** On shutdown: abort live runs so the agents stop; recover() picks the tasks up next start. */
  async shutdown() {
    for (const [, ac] of this.active) ac.abort()
    this.active.clear()
  }

  private async updatePr(planId: string) {
    const { p, a, r, base } = await this.context(planId)
    if (!r?.fullName) return
    const tasks = await db.select().from(task).where(eq(task.planId, planId)).orderBy(asc(task.position))
    const done = tasks.filter((t) => t.status === 'done')
    const runs = done.length ? await db.select().from(run).where(and(inArray(run.taskId, done.map((t) => t.id)), eq(run.status, 'completed'))) : []
    const landed = done.map((t) => {
      const last = runs.filter((x) => x.taskId === t.id).sort((x, y) => y.attempt - x.attempt)[0]
      return { number: t.number, title: t.title, summary: last?.summary, costUsd: last?.costUsd ? Number(last.costUsd) : null, sha: null }
    })
    const body = prBody(p, landed, tasks.filter((t) => t.status !== 'done').map((t) => ({ number: t.number, title: t.title })))
    const result = await ensurePlanPr({ repoPath: r.localPath!, fullName: r.fullName, integrationBranch: p.integrationBranch!, base: a.defaultBranch, title: p.title, body })
    const [existing] = await db.select().from(prTable).where(and(eq(prTable.repoId, r.id), eq(prTable.number, result.number)))
    if (!existing) {
      await db.insert(prTable).values({ id: newId('pr'), taskId: done[0].id, repoId: r.id, number: result.number, url: result.url, headBranch: p.integrationBranch, baseBranch: a.defaultBranch, status: 'open', openedAt: new Date() })
    }
    await this.emit({ ...base, type: result.created ? 'pr.opened' : 'pr.updated', payload: { number: result.number, url: result.url, landed: landed.length } })
  }

  private async context(planId: string) {
    const [p] = await db.select().from(plan).where(eq(plan.id, planId))
    if (!p) throw new PlanError(`no plan ${planId}`)
    const [a] = await db.select().from(app).where(eq(app.id, p.appId))
    const [r] = await db.select().from(repo).where(eq(repo.appId, a.id))
    const base: Omit<NewEvent, 'type'> = { workspaceId: a.workspaceId, appId: a.id, planId, actor: 'engine' }
    return { p, a, r: r?.localPath ? r : null, base }
  }

  private emit(e: NewEvent) {
    return db.transaction((tx) => appendEvent(tx, e))
  }
}

export const runner = new Runner()
