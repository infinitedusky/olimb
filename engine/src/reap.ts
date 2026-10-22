/**
 * Orphans: agent processes that outlived the engine. On startup, find `claude` processes whose working directory
 * is inside one of our worktree roots and stop them, so no task is worked on twice. (InDusk reaped orphan daemons
 * by recorded pid; the SDK doesn't expose pids, so we go by where the process is working.)
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export async function findAgentProcesses(roots: string[]): Promise<{ pid: number; cwd: string }[]> {
  if (roots.length === 0) return []
  let ps = ''
  try { ps = (await execFileP('ps', ['-axo', 'pid=,command='])).stdout } catch { return [] }
  const pids = ps.split('\n')
    .filter((l) => /(^|\/)claude(\s|$)/.test(l.trim().replace(/^\d+\s+/, '')) && !l.includes('grep'))
    .map((l) => Number(l.trim().split(/\s+/)[0]))
    .filter((pid) => pid && pid !== process.pid)
  const found: { pid: number; cwd: string }[] = []
  for (const pid of pids) {
    try {
      const out = (await execFileP('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])).stdout
      const cwd = out.split('\n').find((l) => l.startsWith('n'))?.slice(1) ?? ''
      if (roots.some((r) => cwd === r || cwd.startsWith(r + '/'))) found.push({ pid, cwd })
    } catch { /* process gone or not ours */ }
  }
  return found
}

export async function reapAgentProcesses(roots: string[]): Promise<{ pid: number; cwd: string }[]> {
  const found = await findAgentProcesses(roots)
  for (const { pid } of found) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
  return found
}
