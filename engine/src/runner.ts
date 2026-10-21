/**
 * The runner: starts a plan, dispatches ready tasks into worktrees and agent runs, lands what finishes, retries
 * what doesn't, and keeps the plan's PR current. One process; all state in Postgres; this is the single writer.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'
import { join } from 'node:path'
import { db } from './db/client.js'
import { app, plan, pr as prTable, repo, run, task } from './db/schema.js'
import { appendEvent, type NewEvent } from './events.js'
import { runTask } from './executor.js'
import { addWorktree, ensureBranch, headSha } from './git.js'
import { newId } from './ids.js'
import { land, withLock } from './landing.js'
import { ensurePlanPr, prBody } from './pr.js'
import { planGraph, PlanError, tick } from './plans.js'

export const SESSIONS_MAX = Number(process.env.SESSIONS_MAX ?? 4)

interface AppSetup { test_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }

export class Runner {
  private active = new Set<string>() // task ids with a live run or landing
  private failures = new Map<string, string>() // last failure per task, fed to the next attempt

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

  /** One dispatch pass, serialized per plan: tick, then launch whatever became ready. */
  dispatch(planId: string): Promise<void> {
    return withLock(`dispatch:${planId}`, async () => {
      const room = Math.max(0, SESSIONS_MAX - this.active.size)
      await tick(planId, room)
      const g = (await planGraph(planId))!
      for (const t of g.tasks) {
        if (t.status === 'ready' && !this.active.has(t.id)) {
          this.active.add(t.id)
          this.launch(t.id, planId).catch(async (err) => {
            await this.emit({ ...(await this.context(planId)).base, taskId: t.id, type: 'task.error', payload: { error: String(err?.message ?? err) } })
          }).finally(() => this.active.delete(t.id))
        }
      }
      if (g.tasks.every((t) => t.status === 'done') && g.plan.status === 'running') {
        await db.update(plan).set({ status: 'landed' }).where(eq(plan.id, planId))
        await this.emit({ ...(await this.context(planId)).base, type: 'plan.landed', payload: {} })
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
    const baseSha = await headSha(r!.localPath!, p.integrationBranch!)
    await addWorktree(r!.localPath!, worktreePath, branch, p.integrationBranch!)

    const attempt = t.attempt + 1
    await db.update(task).set({ status: 'running', attempt, branch, worktreePath, baseSha, heldReason: null, updatedAt: new Date() }).where(eq(task.id, taskId))
    const runId = newId('run')
    await db.insert(run).values({ id: runId, taskId, attempt, kind: 'build', agent: 'claude-code', model: setup.model ?? null, status: 'working', budgetCapUsd: setup.max_budget_usd?.toString() ?? null })
    const tb = { ...base, taskId, runId }
    await this.emit({ ...tb, type: 'task.status', payload: { from: t.status, to: 'running', attempt, branch, worktreePath } })

    const result = await runTask({
      task: { id: t.id, number: t.number, title: t.title, brief: t.brief }, worktreePath, branch, files,
      testCmd: setup.test_cmd, previousFailure: this.failures.get(taskId), model: setup.model,
      maxTurns: setup.max_turns, maxBudgetUsd: setup.max_budget_usd,
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

    this.failures.delete(taskId)
    await db.update(task).set({ status: 'done', updatedAt: new Date() }).where(eq(task.id, taskId))
    await this.emit({ ...tb, type: 'task.status', payload: { from: 'merging', to: 'done', sha: landed.sha } })
    await withLock(`land:${planId}`, () => this.updatePr(planId)).catch((err) => this.emit({ ...tb, type: 'pr.error', payload: { error: String(err?.message ?? err) } }))
    this.active.delete(taskId)
    await this.dispatch(planId)
  }

  private async failed(taskId: string, planId: string, attempt: number, max: number, why: string, tb: Omit<NewEvent, 'type'>) {
    this.failures.set(taskId, why)
    const again = attempt < max
    await db.update(task).set({ status: again ? 'queued' : 'failed', heldReason: again ? `attempt ${attempt} failed; will retry` : why.slice(0, 500), updatedAt: new Date() }).where(eq(task.id, taskId))
    await this.emit({ ...tb, type: again ? 'task.retry' : 'task.failed', payload: { attempt, max, why: why.slice(0, 2000) } })
    this.active.delete(taskId)
    await this.dispatch(planId)
  }

  private async updatePr(planId: string) {
    const ctx = await this.context(planId)
    const { p, a, r, base } = ctx
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
