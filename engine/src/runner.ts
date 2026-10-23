/**
 * The runner: starts plans, dispatches ready phases into worktrees and agent runs (as many as the cap allows,
 * across every running plan), lands what finishes one at a time per plan, retries what doesn't, keeps each plan's
 * PR current, cleans up when a plan lands, and recovers after a restart. One process; all state in Postgres.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from './db/client.js'
import { app, event, phase, plan, pr as prTable, repo, run, step, task } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { runTask, type Execute } from './executor.js'
import { addWorktree, ensureBranch, git, headSha, removeWorktree } from './git.js'
import { newId } from './ids.js'
import { land, withLock } from './landing.js'
import { ensurePlanPr, prBody } from './pr.js'
import { planGraph, PlanError, tickAll } from './plans.js'
import { reapAgentProcesses } from './reap.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }

export class Runner {
  private active = new Map<string, AbortController>() // phase id → abort for its live run
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
    const g = (await planGraph(planId))!
    if (!g.phases.length) throw new PlanError('this plan has no phases yet; plan its tasks first')
    const sha = await ensureBranch(r.localPath!, p.integrationBranch!, a.defaultBranch)
    await db.update(plan).set({ status: 'running' }).where(eq(plan.id, planId))
    await this.emit({ ...ctx.base, type: 'plan.started', payload: { integrationBranch: p.integrationBranch, from: a.defaultBranch, sha } })
    void this.dispatch()
    return { integrationBranch: p.integrationBranch, sha }
  }

  /**
   * One dispatch pass across every running plan, serialized: one tick for all of them, launch whatever became
   * ready wherever it is, and close any plan whose phases have all landed. Phases from different plans run at
   * once; phases that share a file never do.
   */
  dispatch(): Promise<void> {
    return withLock('dispatch', async () => {
      const room = Math.max(0, this.sessionsMax - this.active.size)
      await tickAll(room)
      const running = await db.select().from(plan).where(eq(plan.status, 'running'))
      for (const p of running) {
        const g = (await planGraph(p.id))!
        for (const x of g.phases) {
          if (x.status === 'ready' && !this.active.has(x.id)) {
            this.active.set(x.id, new AbortController())
            this.launch(x.id, p.id).catch(async (err) => {
              this.active.delete(x.id)
              await this.emit({ ...(await this.context(p.id)).base, taskId: x.taskId, phaseId: x.id, type: 'phase.error', payload: { error: String(err?.message ?? err) } })
            })
          }
        }
        if (g.phases.length && g.phases.every((x) => x.status === 'done')) {
          await db.update(plan).set({ status: 'landed' }).where(eq(plan.id, p.id))
          await this.emit({ ...(await this.context(p.id)).base, type: 'plan.landed', payload: {} })
          await this.cleanup(p.id)
        }
      }
    })
  }

  private async launch(phaseId: string, planId: string) {
    const ctx = await this.context(planId)
    const { p, a, r, base } = ctx
    const setup = (a.setup ?? {}) as AppSetup
    const [x] = await db.select().from(phase).where(eq(phase.id, phaseId))
    const [t] = await db.select().from(task).where(eq(task.id, x.taskId))
    const g = (await planGraph(planId))!
    const files = g.phases.find((q) => q.id === phaseId)!.files
    const branch = x.branch ?? `phase/${p.id}/${x.number}`
    const worktreePath = x.worktreePath ?? join(`${r!.localPath}-worktrees`, `${p.id}--${x.number}`)
    const pb = { ...base, taskId: x.taskId, phaseId }
    // Worktree and branch creation touch the repo's refs: one at a time per repo. A failure here is an attempt too.
    let baseSha: string
    try {
      baseSha = await withLock(`git:${r!.localPath}`, async () => {
        await addWorktree(r!.localPath!, worktreePath, branch, p.integrationBranch!)
        return headSha(r!.localPath!, p.integrationBranch!)
      })
    } catch (err: any) {
      const attempt = x.attempt + 1
      await db.update(phase).set({ attempt, branch, worktreePath, updatedAt: new Date() }).where(eq(phase.id, phaseId))
      return this.failed(phaseId, attempt, x.maxAttempts, `could not prepare the worktree: ${err?.message ?? err}`, pb)
    }

    const [interrupted] = await db.select().from(run).where(and(eq(run.phaseId, phaseId), eq(run.status, 'interrupted'))).orderBy(desc(run.attempt)).limit(1)
    const previousFailure = await this.lastFailure(phaseId)
    const attempt = x.attempt + 1
    await db.update(phase).set({ status: 'running', attempt, branch, worktreePath, baseSha, heldReason: null, updatedAt: new Date() }).where(eq(phase.id, phaseId))
    const runId = newId('run')
    await db.insert(run).values({ id: runId, appId: a.id, phaseId, attempt, kind: 'build', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
    const rb = { ...pb, runId }
    await this.emit({ ...rb, type: 'phase.status', payload: { from: x.status, to: 'running', attempt, branch, worktreePath, resumes: interrupted?.agentSessionId ?? null } })

    const result = await this.execute({
      phase: { id: x.id, number: x.number, title: x.title, brief: x.brief }, task: { number: t.number, title: t.title, brief: t.brief },
      worktreePath, branch, files, testCmd: setup.test_cmd, previousFailure, model: setup.model, maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
      resumeSessionId: interrupted?.agentSessionId ?? undefined, abort: this.active.get(phaseId),
      onEvent: async (type, payload) => {
        if (type === 'run.steps') await this.saveSteps(a.id, phaseId, runId, (payload.steps as { text: string; status: string }[]) ?? [])
        await this.emit({ ...rb, actor: `agent:${runId}`, type, payload })
      },
    })
    await db.update(run).set({
      status: result.status, endedAt: new Date(), agentSessionId: result.agentSessionId ?? null,
      costUsd: result.costUsd?.toString() ?? null, summary: result.summary ?? null, error: result.error ?? null,
    }).where(eq(run.id, runId))

    if (result.status !== 'completed') return this.failed(phaseId, attempt, x.maxAttempts, `the run ${result.error ?? 'failed'}`, rb)

    await db.update(phase).set({ status: 'merging', updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...rb, type: 'phase.status', payload: { from: 'running', to: 'merging' } })
    const landed = await withLock(`land:${planId}`, () => land({
      repoPath: r!.localPath!, worktreePath, integrationBranch: p.integrationBranch!, testCmd: setup.test_cmd,
      onEvent: async (type, payload) => { await this.emit({ ...rb, type, payload }) },
    }))
    if (!landed.ok) return this.failed(phaseId, attempt, x.maxAttempts, `landing failed at ${landed.stage}: ${landed.detail}`, rb)

    await db.update(phase).set({ status: 'done', updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...rb, type: 'phase.status', payload: { from: 'merging', to: 'done', sha: landed.sha } })
    await withLock(`land:${planId}`, () => this.updatePr(planId)).catch((err) => this.emit({ ...rb, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
    this.active.delete(phaseId)
    await this.dispatch()
  }

  /** The builder's todo list, as the phase's steps: the latest list replaces the previous one for this run. */
  private async saveSteps(appId: string, phaseId: string, runId: string, steps: { text: string; status: string }[]) {
    const allowed = new Set(['pending', 'in_progress', 'completed'])
    await db.transaction(async (tx) => {
      await tx.delete(step).where(and(eq(step.phaseId, phaseId), eq(step.runId, runId)))
      const rows = steps.filter((s) => s.text).map((s, i) => ({ appId, phaseId, runId, position: i, text: s.text.slice(0, 500), status: allowed.has(s.status) ? s.status : 'pending' }))
      if (rows.length) await tx.insert(step).values(rows)
    })
  }

  private async failed(phaseId: string, attempt: number, max: number, why: string, pb: Omit<NewEvent, 'type'>) {
    const [current] = await db.select({ status: phase.status }).from(phase).where(eq(phase.id, phaseId))
    if (current?.status === 'cancelled') { this.active.delete(phaseId); return } // the plan was cancelled under this run; nothing to retry
    const again = attempt < max
    await db.update(phase).set({ status: again ? 'queued' : 'failed', heldReason: again ? `attempt ${attempt} failed; will retry` : why.slice(0, 500), updatedAt: new Date() }).where(eq(phase.id, phaseId))
    await this.emit({ ...pb, type: again ? 'phase.retry' : 'phase.failed', payload: { attempt, max, why: why.slice(0, 2000) } })
    this.active.delete(phaseId)
    await this.dispatch()
  }

  /** The last failure reason comes from the log, so it survives a restart. (A landed phase never retries again.) */
  private async lastFailure(phaseId: string): Promise<string | undefined> {
    const [e] = await db.select().from(event).where(and(eq(event.phaseId, phaseId), inArray(event.type, ['phase.retry', 'phase.failed']))).orderBy(desc(event.seq)).limit(1)
    return e ? String((e.payload as any).why ?? '') : undefined
  }

  /** After a plan lands: remove its phase worktrees and local branches. The integration branch stays (it's the PR). */
  private async cleanup(planId: string) {
    const { p, r, base } = await this.context(planId)
    if (!r) return
    const phases = await db.select().from(phase).where(eq(phase.planId, planId))
    await withLock(`git:${r.localPath}`, async () => {
      for (const x of phases) {
        if (x.worktreePath) await removeWorktree(r.localPath!, x.worktreePath)
        if (x.branch) await git(r.localPath!, ['branch', '-D', x.branch], { allowFail: true })
      }
    })
    await db.update(phase).set({ worktreePath: null }).where(eq(phase.planId, planId))
    await this.emit({ ...base, type: 'plan.cleaned', payload: { worktrees: phases.filter((x) => x.worktreePath).length, integrationBranch: p.integrationBranch } })
  }

  /** On startup: reap stray agents, mark their runs interrupted, re-queue their phases, and resume running plans. */
  async recover() {
    const running = await db.select().from(plan).where(eq(plan.status, 'running'))
    const repos = await db.select().from(repo)
    const roots = repos.filter((q) => q.localPath).map((q) => `${q.localPath}-worktrees`)
    const reaped = await reapAgentProcesses(roots)
    const stuck = await db.select().from(phase).where(inArray(phase.status, ['running', 'merging', 'testing']))
    for (const x of stuck) {
      await db.update(run).set({ status: 'interrupted', endedAt: new Date(), error: 'engine restarted' }).where(and(eq(run.phaseId, x.id), eq(run.status, 'working')))
      await db.update(phase).set({ status: 'queued', heldReason: 'interrupted by a restart; will resume', updatedAt: new Date() }).where(eq(phase.id, x.id))
      const { base } = await this.context(x.planId)
      await this.emit({ ...base, taskId: x.taskId, phaseId: x.id, type: 'phase.interrupted', payload: { was: x.status, reaped: reaped.filter((q) => x.worktreePath && q.cwd.startsWith(x.worktreePath)).map((q) => q.pid) } })
    }
    if (running.length) void this.dispatch()
    return { plans: running.length, phases: stuck.length, reaped: reaped.length }
  }

  /** On shutdown: abort live runs so the agents stop; recover() picks the phases up next start. */
  async shutdown() {
    for (const [, ac] of this.active) ac.abort()
    this.active.clear()
  }

  /**
   * Stop a plan: abort its live runs, cancel every phase that hasn't landed, mark the plan stopped (it stays on the
   * lists and the graph with what it landed; superseded is for a plan another plan replaced), remove its
   * worktrees. What landed stays on the integration branch (and in its PR, if one was opened).
   */
  async cancelPlan(planId: string, why = 'cancelled by a person') {
    const ctx = await this.context(planId)
    const phases = await db.select().from(phase).where(eq(phase.planId, planId))
    const ids = phases.map((x) => x.id)
    const open = phases.filter((x) => x.status !== 'done')
    if (open.length) await db.update(phase).set({ status: 'cancelled', heldReason: why, updatedAt: new Date() }).where(inArray(phase.id, open.map((x) => x.id)))
    await db.update(plan).set({ status: 'stopped' }).where(eq(plan.id, planId))
    for (const x of phases) { const ac = this.active.get(x.id); if (ac) { ac.abort(); this.active.delete(x.id) } } // after the status flip: a failed run then sees 'cancelled' and stops
    if (ids.length) await db.update(run).set({ status: 'stopped', endedAt: new Date(), error: why }).where(and(inArray(run.phaseId, ids), eq(run.status, 'working')))
    await this.emit({ ...ctx.base, type: 'plan.cancelled', payload: { why, cancelled: open.length, landed: phases.length - open.length } })
    await this.cleanup(planId).catch(() => {}) // a worktree with an agent mid-write may refuse once; recovery handles leftovers
    return { cancelled: open.length, landed: phases.length - open.length }
  }

  /**
   * A person retries a failed (or cancelled) phase: three more attempts, and the builder is told why the last one
   * failed. By default it continues in the same worktree with what the last attempt left; fresh starts over from
   * the plan's branch. A stopped plan resumes: it runs again, with its other cancelled phases queued too.
   */
  async retryPhase(phaseId: string, opts: { fresh?: boolean; actor?: string } = {}) {
    const [x] = await db.select().from(phase).where(eq(phase.id, phaseId))
    if (!x) throw new PlanError(`no phase ${phaseId}`)
    if (!['failed', 'cancelled'].includes(x.status)) throw new PlanError(`phase #${x.number} is ${x.status}; only a failed or cancelled phase can be retried`)
    const ctx = await this.context(x.planId)
    const { p, a, r } = ctx
    if (!r) throw new PlanError(`app ${a.name} has no repo with a local path`)
    if (opts.fresh && (x.worktreePath || x.branch)) {
      await withLock(`git:${r.localPath}`, async () => {
        if (x.worktreePath) await removeWorktree(r.localPath!, x.worktreePath)
        if (x.branch) await git(r.localPath!, ['branch', '-D', x.branch], { allowFail: true })
      })
    }
    const requeue = { status: 'queued', heldReason: null, maxAttempts: x.attempt + 3, updatedAt: new Date(), ...(opts.fresh ? { worktreePath: null, branch: null } : {}) }
    await db.update(phase).set(requeue).where(eq(phase.id, phaseId))
    const resumed: number[] = []
    if (p.status !== 'running') {
      if (p.status === 'stopped') { // resume: the other cancelled phases come back too
        const others = (await db.select().from(phase).where(and(eq(phase.planId, p.id), eq(phase.status, 'cancelled')))).filter((o) => o.id !== phaseId)
        for (const o of others) { await db.update(phase).set({ status: 'queued', heldReason: null, maxAttempts: o.attempt + 3, updatedAt: new Date() }).where(eq(phase.id, o.id)); resumed.push(o.number) }
      }
      await ensureBranch(r.localPath!, p.integrationBranch!, a.defaultBranch)
      await db.update(plan).set({ status: 'running' }).where(eq(plan.id, p.id))
    }
    await this.emit({ ...ctx.base, actor: opts.actor ?? 'user', taskId: x.taskId, phaseId, type: 'phase.status', payload: { from: x.status, to: 'queued', why: `retried by a person${opts.fresh ? ', from scratch' : ''}`, attempts: 3, resumed } })
    void this.dispatch()
    return { phase: x.number, fresh: !!opts.fresh, resumed }
  }

  private async updatePr(planId: string) {
    const { p, a, r, base } = await this.context(planId)
    if (!r?.fullName) return
    const tasks = await db.select().from(task).where(eq(task.planId, planId)).orderBy(asc(task.position))
    const phases = await db.select().from(phase).where(eq(phase.planId, planId)).orderBy(asc(phase.position))
    const done = phases.filter((x) => x.status === 'done')
    const runs = done.length ? await db.select().from(run).where(and(inArray(run.phaseId, done.map((x) => x.id)), eq(run.status, 'completed'))) : []
    const landed = done.map((x) => {
      const last = runs.filter((q) => q.phaseId === x.id).sort((q, w) => w.attempt - q.attempt)[0]
      const t = tasks.find((q) => q.id === x.taskId)
      return { number: x.number, title: `${x.title}${t ? ` (task #${t.number}: ${t.title})` : ''}`, summary: last?.summary, costUsd: last?.costUsd ? Number(last.costUsd) : null, sha: null }
    })
    const body = prBody(p, landed, phases.filter((x) => x.status !== 'done').map((x) => ({ number: x.number, title: x.title })))
    const result = await ensurePlanPr({ repoPath: r.localPath!, fullName: r.fullName, integrationBranch: p.integrationBranch!, base: a.defaultBranch, title: p.title, body })
    const [existing] = await db.select().from(prTable).where(eq(prTable.planId, planId))
    if (!existing) {
      await db.insert(prTable).values({ id: newId('pr'), appId: a.id, planId, repoId: r.id, number: result.number, url: result.url, headBranch: p.integrationBranch, baseBranch: a.defaultBranch, status: 'open', openedAt: new Date() })
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
