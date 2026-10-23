/**
 * The runner with a fake executor against a throwaway git repo and the test database: parallel under the cap,
 * dependents after their parents land, task order, two plans at once, retries with the reason, recovery after a
 * restart, steps from the builder, cleanup. The fake executor writes a file and commits, like an agent would.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from './db/client.js'
import { app, event, phase, plan, repo, run, step, workspace } from './db/schema.js'
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
const cleaned = (planId: string) => async () => (await db.select().from(event).where(eq(event.planId, planId))).some((e) => e.type === 'plan.cleaned')

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
    await db.update(plan).set({ status: 'superseded' }).where(eq(plan.appId, appId))
    await pool.end()
  })

  const commits = (tag: string): Execute => async (i) => {
    await sleep(150)
    await writeFile(join(i.worktreePath, `${tag}-${i.phase.number}.txt`), 'x\n')
    await commitAll(i.worktreePath, `phase ${i.phase.number}`)
    return { status: 'completed', summary: `did ${i.phase.title}`, costUsd: 0 }
  }
  const one = (title: string, phases: { key: string; title: string; files?: string[]; dependsOn?: string[] }[]) => ({ title, phases })

  it('runs independent phases in parallel under the cap, dependents only after their parents land, then cleans up', async () => {
    const { plan: p, phases } = await createPlan({ appId, title: 'parallel', tasks: [one('T', [
      { key: 'a', title: 'A', files: ['a.txt'] }, { key: 'b', title: 'B', files: ['b.txt'] }, { key: 'c', title: 'C', files: ['c.txt'] },
      { key: 'd', title: 'D', dependsOn: ['a', 'b', 'c'], files: ['d.txt'] },
    ])] })
    const parents = phases.slice(0, 3).map((x) => x.id)
    let live = 0, maxLive = 0, parentsWhenDStarted: string[] = []
    const execute: Execute = async (i) => {
      live++; maxLive = Math.max(maxLive, live)
      if (i.phase.title === 'D') parentsWhenDStarted = (await db.select().from(phase).where(inArray(phase.id, parents))).map((x) => x.status)
      try { return await commits('f')(i) } finally { live-- }
    }
    const runner = new Runner({ execute, sessionsMax: 2 })
    await runner.startPlan(p.id)
    await until(cleaned(p.id))
    expect(maxLive).toBe(2)
    expect(parentsWhenDStarted).toEqual(['done', 'done', 'done'])
    const g = (await planGraph(p.id))!
    expect(g.phases.map((x) => x.status)).toEqual(['done', 'done', 'done', 'done'])
    for (const n of [1, 2, 3, 4]) expect((await git(repoPath, ['show', `${p.integrationBranch}:f-${n}.txt`])).stdout).toBe('x')
    const held = (await db.select().from(event).where(eq(event.planId, p.id))).filter((e) => e.type === 'phase.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => r === 'at the session cap')).toBe(true)
    expect(held.some((r) => r.startsWith('waiting on'))).toBe(true)
    expect((await git(repoPath, ['worktree', 'list', '--porcelain'])).stdout.split('\n').filter((l) => l.includes('-worktrees/'))).toEqual([])
    expect(g.phases.every((x) => x.worktreePath === null)).toBe(true)
  })

  it('task order is a dependency: a later task\'s phases start only after the earlier task\'s phases land', async () => {
    const { plan: p } = await createPlan({ appId, title: 'ordered', tasks: [
      one('first', [{ key: 'a', title: 'A', files: ['oa.txt'] }, { key: 'b', title: 'B', files: ['ob.txt'] }]),
      one('second', [{ key: 'c', title: 'C', files: ['oc.txt'] }]),
    ] })
    const order: string[] = []; let firstDoneWhenCStarted = false
    const runner = new Runner({ execute: async (i) => {
      order.push(i.phase.title)
      if (i.phase.title === 'C') firstDoneWhenCStarted = (await db.select().from(phase).where(eq(phase.planId, p.id))).filter((x) => x.title !== 'C').every((x) => x.status === 'done')
      return commits('o')(i)
    }, sessionsMax: 4 })
    await runner.startPlan(p.id)
    await until(cleaned(p.id))
    expect(order.indexOf('C')).toBe(2)
    expect(firstDoneWhenCStarted).toBe(true)
    const held = (await db.select().from(event).where(eq(event.planId, p.id))).filter((e) => e.type === 'phase.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => /earlier in the plan/.test(r))).toBe(true)
  })

  it('runs phases from different plans at once, but never two that share a file, and lands both plans', async () => {
    const A = await createPlan({ appId, title: 'plan A', tasks: [one('T', [{ key: 'a1', title: 'A1', files: ['shared.txt'] }, { key: 'a2', title: 'A2', files: ['only-a.txt'] }])] })
    const B = await createPlan({ appId, title: 'plan B', tasks: [one('T', [{ key: 'b1', title: 'B1', files: ['shared.txt'] }, { key: 'b2', title: 'B2', files: ['only-b.txt'] }])] })
    const live = new Set<string>(); const overlapsOnShared: string[][] = []; let maxLive = 0
    const execute: Execute = async (i) => {
      live.add(i.phase.title); maxLive = Math.max(maxLive, live.size)
      if (i.files.includes('shared.txt')) overlapsOnShared.push([...live].filter((x) => ['A1', 'B1'].includes(x)))
      try { return await commits('x')(i) } finally { live.delete(i.phase.title) }
    }
    const runner = new Runner({ execute, sessionsMax: 4 })
    await runner.startPlan(A.plan.id); await runner.startPlan(B.plan.id)
    await until(async () => (await cleaned(A.plan.id)()) && (await cleaned(B.plan.id)()))
    expect(maxLive).toBeGreaterThanOrEqual(2)
    for (const snapshot of overlapsOnShared) expect(snapshot.length).toBe(1)
    const held = (await db.select().from(event).where(inArray(event.planId, [A.plan.id, B.plan.id]))).filter((e) => e.type === 'phase.held').map((e) => (e.payload as any).reason)
    expect(held.some((r) => /waiting on phase #\d+ \(.+\) \(another plan\)/.test(r))).toBe(true)
  })

  it('retries a failed run with the reason, and gives up after max attempts', async () => {
    const { plan: p, phases } = await createPlan({ appId, title: 'retries', tasks: [one('T', [{ key: 'x', title: 'X', files: ['x.txt'] }])] })
    const reasons: (string | undefined)[] = []
    const runner = new Runner({ execute: async (i) => { reasons.push(i.previousFailure); return { status: 'failed', error: 'boom' } }, sessionsMax: 2 })
    await runner.startPlan(p.id)
    await until(async () => (await planGraph(p.id))!.phases[0].status === 'failed')
    expect((await planGraph(p.id))!.phases[0].attempt).toBe(3)
    expect(reasons[0]).toBeUndefined(); expect(reasons[1]).toContain('boom'); expect(reasons[2]).toContain('boom')
    const types = (await db.select().from(event).where(eq(event.phaseId, phases[0].id))).map((e) => e.type)
    expect(types.filter((x) => x === 'phase.retry')).toHaveLength(2)
    expect(types.filter((x) => x === 'phase.failed')).toHaveLength(1)
  })

  it('a person retries a failed phase: three more attempts, told why it failed, then it lands', async () => {
    const { plan: p, phases } = await createPlan({ appId, title: 'retry by hand', tasks: [one('T', [{ key: 'r', title: 'R', files: ['r.txt'] }])] })
    let fail = true
    const told: (string | undefined)[] = []
    const runner = new Runner({ execute: async (i) => { told.push(i.previousFailure); return fail ? { status: 'failed', error: 'flaky' } : commits('r')(i) }, sessionsMax: 2 })
    await runner.startPlan(p.id)
    await until(async () => (await planGraph(p.id))!.phases[0].status === 'failed')
    fail = false
    await expect(runner.retryPhase(phases[0].id)).resolves.toMatchObject({ fresh: false })
    await until(cleaned(p.id))
    const after = (await planGraph(p.id))!
    expect(after.phases[0]).toMatchObject({ status: 'done', attempt: 4, maxAttempts: 6 })
    expect(told.at(-1)).toContain('flaky')
    await expect(runner.retryPhase(phases[0].id)).rejects.toThrow(/only a failed or cancelled/)
  })

  it('stores the builder\'s todo list as the phase\'s steps, latest list wins', async () => {
    const { plan: p, phases } = await createPlan({ appId, title: 'steps', tasks: [one('T', [{ key: 's', title: 'S', files: ['s.txt'] }])] })
    const runner = new Runner({ execute: async (i) => {
      await i.onEvent('run.steps', { steps: [{ text: 'read the code', status: 'completed' }, { text: 'write it', status: 'in_progress' }, { text: 'test it', status: 'pending' }] })
      await i.onEvent('run.steps', { steps: [{ text: 'read the code', status: 'completed' }, { text: 'write it', status: 'completed' }, { text: 'test it', status: 'in_progress' }] })
      return commits('s')(i)
    }, sessionsMax: 2 })
    await runner.startPlan(p.id)
    await until(cleaned(p.id))
    const rows = await db.select().from(step).where(eq(step.phaseId, phases[0].id))
    expect(rows.map((r) => [r.position, r.text, r.status])).toEqual([[0, 'read the code', 'completed'], [1, 'write it', 'completed'], [2, 'test it', 'in_progress']])
    expect((await planGraph(p.id))!.phases[0].steps.map((s) => s.text)).toEqual(['read the code', 'write it', 'test it'])
  })

  it('recover() re-queues phases that were running, marks their runs interrupted, and resumes the agent session', async () => {
    const { plan: p, phases } = await createPlan({ appId, title: 'recovery', tasks: [one('T', [{ key: 'r', title: 'R', files: ['r.txt'] }])] })
    await db.update(plan).set({ status: 'running' }).where(eq(plan.id, p.id))
    await db.update(phase).set({ status: 'running', attempt: 1 }).where(eq(phase.id, phases[0].id))
    await db.insert(run).values({ id: newId('run'), appId, phaseId: phases[0].id, attempt: 1, kind: 'build', agent: 'claude-code', status: 'working', agentSessionId: 'sess-123' })
    await git(repoPath, ['branch', p.integrationBranch!, 'main'])
    let resumed: string | undefined
    const runner = new Runner({ execute: async (i) => { resumed = i.resumeSessionId; return commits('r')(i) }, sessionsMax: 2 })
    const r = await runner.recover()
    expect(r.phases).toBeGreaterThanOrEqual(1)
    await until(cleaned(p.id))
    expect(resumed).toBe('sess-123')
    const runs = await db.select().from(run).where(eq(run.phaseId, phases[0].id))
    expect(runs.map((x) => x.status).sort()).toEqual(['completed', 'interrupted'])
    const types = (await db.select().from(event).where(eq(event.phaseId, phases[0].id))).map((e) => e.type)
    expect(types).toContain('phase.interrupted')
  })
})
