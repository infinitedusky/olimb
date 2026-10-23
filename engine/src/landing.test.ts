/** Landing against a throwaway git repo: merge → test → fast-forward, and the ways it refuses. */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addWorktree, commitAll, ensureBranch, git, headSha } from './git.js'
import { land } from './landing.js'

async function repoWithPlan() {
  const dir = await mkdtemp(join(tmpdir(), 'if-land-'))
  const repoPath = join(dir, 'repo')
  await git(dir, ['init', '-q', '-b', 'main', 'repo'])
  await git(repoPath, ['config', 'user.email', 't@example.com']); await git(repoPath, ['config', 'user.name', 'test'])
  await writeFile(join(repoPath, 'a.txt'), 'one\n'); await commitAll(repoPath, 'init')
  await ensureBranch(repoPath, 'project/p1', 'main')
  const wt = join(dir, 'wt-1')
  await addWorktree(repoPath, wt, 'task/p1/1', 'project/p1')
  await git(wt, ['config', 'user.email', 't@example.com']); await git(wt, ['config', 'user.name', 'test'])
  return { repoPath, wt }
}
const events: string[] = []
const onEvent = async (type: string) => { events.push(type) }

describe('land', () => {
  it('merges, tests and fast-forwards the integration branch to the task', async () => {
    const { repoPath, wt } = await repoWithPlan()
    await writeFile(join(wt, 'b.txt'), 'two\n'); await commitAll(wt, 'task 1')
    const r = await land({ repoPath, worktreePath: wt, integrationBranch: 'project/p1', testCmd: 'test -f b.txt', onEvent })
    expect(r.ok).toBe(true)
    expect(await headSha(repoPath, 'project/p1')).toBe(await headSha(wt))
    expect(events).toContain('land.tested'); expect(events).toContain('land.landed')
  })

  it('commits what the agent left uncommitted, and refuses when the tests fail', async () => {
    const { repoPath, wt } = await repoWithPlan()
    await writeFile(join(wt, 'b.txt'), 'two\n')
    const before = await headSha(repoPath, 'project/p1')
    const r = await land({ repoPath, worktreePath: wt, integrationBranch: 'project/p1', testCmd: 'exit 3', onEvent })
    expect(r).toMatchObject({ ok: false, stage: 'test' })
    expect(await headSha(repoPath, 'project/p1')).toBe(before)
    expect(events).toContain('land.committed')
  })

  it('merges in what landed before it, and reports a conflict instead of guessing', async () => {
    const { repoPath, wt } = await repoWithPlan()
    // another task landed on the integration branch meanwhile, touching a.txt
    const wt2 = join(repoPath, '..', 'wt-2')
    await addWorktree(repoPath, wt2, 'task/p1/2', 'project/p1')
    await git(wt2, ['config', 'user.email', 't@example.com']); await git(wt2, ['config', 'user.name', 'test'])
    await writeFile(join(wt2, 'a.txt'), 'two from task 2\n'); await commitAll(wt2, 'task 2')
    expect((await land({ repoPath, worktreePath: wt2, integrationBranch: 'project/p1', onEvent })).ok).toBe(true)
    // task 1 touched a different file: merges cleanly and lands on top
    await writeFile(join(wt, 'c.txt'), 'three\n'); await commitAll(wt, 'task 1')
    const ok = await land({ repoPath, worktreePath: wt, integrationBranch: 'project/p1', onEvent })
    expect(ok.ok).toBe(true)
    expect((await git(repoPath, ['show', 'project/p1:a.txt'])).stdout).toBe('two from task 2')
    // a third task that edited the same line as task 2 conflicts and is refused
    const wt3 = join(repoPath, '..', 'wt-3')
    await addWorktree(repoPath, wt3, 'task/p1/3', await headSha(repoPath, 'main'))
    await git(wt3, ['config', 'user.email', 't@example.com']); await git(wt3, ['config', 'user.name', 'test'])
    await writeFile(join(wt3, 'a.txt'), 'two from task 3\n'); await commitAll(wt3, 'task 3')
    const bad = await land({ repoPath, worktreePath: wt3, integrationBranch: 'project/p1', onEvent })
    expect(bad).toMatchObject({ ok: false, stage: 'merge' })
    expect((bad as any).detail).toContain('a.txt')
  })
})
