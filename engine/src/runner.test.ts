/**
 * The runner with a fake executor against a throwaway git repo and the real database: parallel under the cap,
 * dependents after their parents land, retries with the reason, recovery after a restart, cleanup.
 * Skipped without Postgres. The fake executor writes a file and commits, like an agent would.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, plan, repo, run, task, workspace } from './db/schema.js'
import type { Execute } from './executor.js'
import { commitAll, git } from './git.js'
import { newId } from './ids.js'
import { createPlan, planGraph } from './plans.js'
import { Runner } from './runner.js'

let reachable = true
try { await db.execute('select 1') } catch { reachable = false }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(check: () => Promise<boolean>, timeoutMs = 20_000) {
  const t0 = Date.now()
  while (!(await check())) { if (Date.now() - t0 > timeoutMs) throw new Error('timed out'); await sleep(100) }
}

describe.skipIf(!reachable)('runner', () => {
  const wsId = newId('workspace')
  let appId: string, repoPath: string

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'if-runner-'))
    repoPath = join(dir, 'repo')
    await git(dir, ['init', '-q', '-b', 'main', 'repo'])
    await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
    await writeFile(join(repoPath, 'README.md'), 'hi\n'); await commitAll(repoPath, 'init')
    appId = newId('app')
    await db.insert(workspace).values({ id: wsId, name: 'runner test' })
    await db.insert(app).values({ id: appId, workspaceId: wsId, name: 'fake app', setup: { test_cmd: 'test -f README.md' } })
    await db.insert(repo).values({ id: newId('repo'), appId, fullName: '', localPath: repoPath }) // no fullName: no PR step
  })
  afterAll(async () => {
    await db.update(plan).set({ status: 'superseded' }).where(eq(plan.appId, appId)) // never picked up by a real recover()
    await pool.end()
  })

  const commits = (title: string): Execute => async (i) => {
    await sleep(150)
    await writeFile(join(i.worktreePath, `${title}-${i.task.number}.txt`), 'x\n')
    await commitAll(i.worktreePath, `task ${i.task.number}`)
    return { status: 'completed', summary: `did ${i.task.title}`, costUsd: 0 }
  }

  it('runs independent tasks in parallel under the cap, dependents only after their parents land, then cleans up', async () => {
    const { plan: p, tasks } = await createPlan({ appId, title: 'parallel', tasks: [
      { key: 'a', title: 'A', files: ['a.txt'] }, { key: 'b', title: 'B', files: ['b.txt'] }, { key: 'c', title: 'C', files: ['c.txt'] },
      { key: 'd', title: 'D', dependsOn: ['a', 'b', 'c'], files: ['d.txt'] },
    ] })
    const parents = tasks.slice(0, 3).map((t) => t.id)
    let live = 0, maxLive = 0, parentsWhenDStarted: string[] = []
    const execute: Execute = async (i) => {
      live++; maxLive = Math.max(maxLive, live)
      if (i.task.title === 'D') parentsWhenDStarted = (await db.select().from(task).where(inArray(task.id, parents))).map((t) => t.status)
      try { return await commits('f')(i) } finally { live-- }
    }
    const runner = new Runner({ execute, sessionsMax: 2 })
    await runner.startPlan(p.id)
    const cleaned = async () => (await db.select().from(event).where(eq(event.planId, p.id))).some((e) => e.type === 'plan.cleaned')
    await until(cleaned)

    expect(maxLive).toBe(2)
    expect(parentsWhenDStarted).toEqual(['done', 'done', 'done'])
    const g = (await planGraph(p.id))!
    expect(g.tasks.map((t) => t.status)).toEqual(['done', 'done', 'done', 'done'])
    for (const n of [1, 2, 3, 4]) expect((await git(repoPath, ['show', `${p.integrationBranch}:f-${n}.txt`])).stdout).toBe('x')
    const held = (await db.select().from(event).where(eq(event.planId, p.id))).filter((e) => e.type === 'task.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => r === 'at the session cap')).toBe(true)
    expect(held.some((r) => r.startsWith('waiting on'))).toBe(true)
    expect((await git(repoPath, ['worktree', 'list', '--porcelain'])).stdout.split('\n').filter((l) => l.includes('-worktrees/'))).toEqual([])
    expect(g.tasks.every((t) => t.worktreePath === null)).toBe(true)
    const types = (await db.select().from(event).where(eq(event.planId, p.id))).map((e) => e.type)
    expect(types).toContain('plan.landed'); expect(types).toContain('plan.cleaned')
  })

  it('retries a failed run with the reason, and gives up after max attempts', async () => {
    const { plan: p, tasks } = await createPlan({ appId, title: 'retries', tasks: [{ key: 'x', title: 'X', files: ['x.txt'] }] })
    const reasons: (string | undefined)[] = []
    const runner = new Runner({ execute: async (i) => { reasons.push(i.previousFailure); return { status: 'failed', error: 'boom' } }, sessionsMax: 2 })
    await runner.startPlan(p.id)
    await until(async () => (await planGraph(p.id))!.tasks[0].status === 'failed')
    const t = (await planGraph(p.id))!.tasks[0]
    expect(t.attempt).toBe(3)
    expect(reasons[0]).toBeUndefined(); expect(reasons[1]).toContain('boom'); expect(reasons[2]).toContain('boom')
    const types = (await db.select().from(event).where(eq(event.taskId, tasks[0].id))).map((e) => e.type)
    expect(types.filter((x) => x === 'task.retry')).toHaveLength(2)
    expect(types.filter((x) => x === 'task.failed')).toHaveLength(1)
  })

  it('recover() re-queues tasks that were running, marks their runs interrupted, and resumes the agent session', async () => {
    const { plan: p, tasks } = await createPlan({ appId, title: 'recovery', tasks: [{ key: 'r', title: 'R', files: ['r.txt'] }] })
    // As if the engine died mid-run: plan running, task running, a run still "working" with a session id.
    await db.update(plan).set({ status: 'running' }).where(eq(plan.id, p.id))
    await db.update(task).set({ status: 'running', attempt: 1 }).where(eq(task.id, tasks[0].id))
    await db.insert(run).values({ id: newId('run'), taskId: tasks[0].id, attempt: 1, kind: 'build', agent: 'claude-code', status: 'working', agentSessionId: 'sess-123' })
    await git(repoPath, ['branch', p.integrationBranch!, 'main'])
    let resumed: string | undefined
    const runner = new Runner({ execute: async (i) => { resumed = i.resumeSessionId; return commits('r')(i) }, sessionsMax: 2 })
    const r = await runner.recover()
    expect(r.tasks).toBeGreaterThanOrEqual(1)
    await until(async () => (await planGraph(p.id))!.plan.status === 'landed')
    expect(resumed).toBe('sess-123')
    const runs = await db.select().from(run).where(eq(run.taskId, tasks[0].id))
    expect(runs.map((x) => x.status).sort()).toEqual(['completed', 'interrupted'])
    const types = (await db.select().from(event).where(eq(event.taskId, tasks[0].id))).map((e) => e.type)
    expect(types).toContain('task.interrupted')
  })
})
