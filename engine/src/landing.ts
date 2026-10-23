/**
 * Landing: parallel work, serial landing. A finished task is merged with the project's integration branch, tested on
 * the merged commit, and fast-forwarded onto the integration branch — one task at a time per project.
 * (InDusk run-the-graph D5/D6; the data on agent PR conflicts says keep writes single-threaded.)
 */
import { spawn } from 'node:child_process'
import { commitAll, fastForward, hasUncommitted, headSha, mergeInto } from './git.js'

export interface LandInput {
  repoPath: string // the main checkout: owns the refs
  worktreePath: string // the task's worktree
  integrationBranch: string
  testCmd?: string
  testTimeoutMs?: number
  onEvent: (type: string, payload: Record<string, unknown>) => Promise<void>
}

export type LandResult = { ok: true; sha: string } | { ok: false; stage: 'merge' | 'test' | 'ff'; detail: string }

const locks = new Map<string, Promise<unknown>>()

/** Serialize work per key (a project): the next landing waits for the previous one. */
export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(key, next.catch(() => undefined))
  return next
}

export async function land(i: LandInput): Promise<LandResult> {
  if (await hasUncommitted(i.worktreePath)) {
    const sha = await commitAll(i.worktreePath, 'Commit remaining work (engine)')
    await i.onEvent('land.committed', { sha, note: 'the agent left uncommitted changes' })
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const base = await headSha(i.repoPath, i.integrationBranch)
    const merged = await mergeInto(i.worktreePath, base)
    if (!merged.ok) { await i.onEvent('land.conflict', { files: merged.conflict }); return { ok: false, stage: 'merge', detail: `conflicts with the integration branch in: ${merged.conflict}` } }
    if (i.testCmd) {
      const t = await run(i.testCmd, i.worktreePath, i.testTimeoutMs ?? 10 * 60_000)
      await i.onEvent('land.tested', { ok: t.code === 0, code: t.code, tail: t.tail })
      if (t.code !== 0) return { ok: false, stage: 'test', detail: `tests failed (exit ${t.code}):\n${t.tail}` }
    }
    const sha = await headSha(i.worktreePath)
    const ff = await fastForward(i.repoPath, i.integrationBranch, sha, base)
    if (ff.ok) { await i.onEvent('land.landed', { sha, integrationBranch: i.integrationBranch }); return { ok: true, sha } }
    await i.onEvent('land.retry', { attempt, reason: ff.reason }) // the branch moved under us: merge again
  }
  return { ok: false, stage: 'ff', detail: 'the integration branch kept moving' }
}

function run(cmd: string, cwd: string, timeoutMs: number): Promise<{ code: number; tail: string }> {
  return new Promise((resolveP) => {
    const child = spawn('sh', ['-c', cmd], { cwd, env: { ...process.env, CI: '1' } })
    let out = ''
    const take = (b: Buffer) => { out = (out + b.toString()).slice(-20_000) }
    child.stdout.on('data', take); child.stderr.on('data', take)
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += `\n[timed out after ${timeoutMs / 1000}s]` }, timeoutMs)
    child.on('close', (code) => { clearTimeout(timer); resolveP({ code: code ?? 1, tail: out.slice(-3000) }) })
  })
}
