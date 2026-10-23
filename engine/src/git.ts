/** Git, as the engine uses it: one worktree per task, an integration branch per project, fast-forward landings. */
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export interface GitResult { code: number; stdout: string; stderr: string }

export async function git(cwd: string, args: string[], opts: { allowFail?: boolean } = {}): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileP('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err: any) {
    if (opts.allowFail && typeof err.code === 'number') return { code: err.code, stdout: (err.stdout ?? '').trim(), stderr: (err.stderr ?? '').trim() }
    throw new Error(`git ${args.join(' ')} (in ${cwd}): ${err.stderr?.trim() || err.message}`)
  }
}

export const headSha = async (cwd: string, ref = 'HEAD') => (await git(cwd, ['rev-parse', ref])).stdout

export async function branchExists(repo: string, name: string): Promise<boolean> {
  return (await git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`], { allowFail: true })).code === 0
}

/** Create `name` at `from` unless it exists. Never changes what any worktree has checked out. */
export async function ensureBranch(repo: string, name: string, from: string): Promise<string> {
  if (!(await branchExists(repo, name))) await git(repo, ['branch', name, from])
  return headSha(repo, name)
}

const real = (p: string) => realpath(p).catch(() => p) // git reports resolved paths (/private/var/… for /var/…)

export async function worktreeExists(repo: string, path: string): Promise<boolean> {
  const listed = (await git(repo, ['worktree', 'list', '--porcelain'])).stdout.split('\n')
    .filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length))
  const target = await real(path)
  for (const l of listed) if ((await real(l)) === target) return true
  return false
}

/** A worktree at `path` on `branch`, creating the branch at `startPoint` if needed. Idempotent. */
export async function addWorktree(repo: string, path: string, branch: string, startPoint: string): Promise<void> {
  if (await worktreeExists(repo, path)) return
  if (await branchExists(repo, branch)) await git(repo, ['worktree', 'add', path, branch])
  else await git(repo, ['worktree', 'add', '-b', branch, path, startPoint])
}

export async function removeWorktree(repo: string, path: string): Promise<void> {
  await git(repo, ['worktree', 'remove', '--force', path], { allowFail: true })
}

export const hasUncommitted = async (cwd: string) => (await git(cwd, ['status', '--porcelain'])).stdout !== ''

export async function commitAll(cwd: string, message: string): Promise<string> {
  await git(cwd, ['add', '-A'])
  await git(cwd, ['commit', '-q', '-m', message])
  return headSha(cwd)
}

/** Merge `ref` into the branch checked out at `cwd`. On conflict, abort and report it. */
export async function mergeInto(cwd: string, ref: string): Promise<{ ok: true } | { ok: false; conflict: string }> {
  const r = await git(cwd, ['merge', '--no-edit', ref], { allowFail: true })
  if (r.code === 0) return { ok: true }
  const files = (await git(cwd, ['diff', '--name-only', '--diff-filter=U'], { allowFail: true })).stdout
  await git(cwd, ['merge', '--abort'], { allowFail: true })
  return { ok: false, conflict: files || r.stderr || r.stdout }
}

export async function isAncestor(repo: string, ancestor: string, descendant: string): Promise<boolean> {
  return (await git(repo, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFail: true })).code === 0
}

/**
 * Fast-forward `branch` to `toSha` without checking it out anywhere: a compare-and-swap on the ref.
 * Fails if the branch moved since `expectedOld` or `toSha` doesn't descend from it.
 */
export async function fastForward(repo: string, branch: string, toSha: string, expectedOld: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!(await isAncestor(repo, expectedOld, toSha))) return { ok: false, reason: `${toSha.slice(0, 7)} does not descend from ${expectedOld.slice(0, 7)}` }
  const r = await git(repo, ['update-ref', `refs/heads/${branch}`, toSha, expectedOld], { allowFail: true })
  return r.code === 0 ? { ok: true } : { ok: false, reason: r.stderr || 'ref moved' }
}

export async function push(repo: string, refspec: string, opts: { setUpstream?: boolean } = {}): Promise<void> {
  await git(repo, ['push', ...(opts.setUpstream ? ['-u'] : []), 'origin', refspec])
}

export const shortStat = async (cwd: string, from: string, to: string) => (await git(cwd, ['diff', '--shortstat', from, to])).stdout
export const logOneline = async (cwd: string, from: string, to: string) => (await git(cwd, ['log', '--oneline', `${from}..${to}`])).stdout
