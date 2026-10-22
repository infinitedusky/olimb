/**
 * Risk: what a tool call could cost if it is wrong, judged by the engine, never by the agent. The planner's rule
 * for questions (cheap / moderate / expensive, set by the server) applied to the agent's hands. A conversation
 * auto-approves up to a threshold and asks above it; expensive always asks.
 *
 *   free      reading, searching, the engine's read-only tools
 *   cheap     easy to undo: edits on a branch, tests, builds, keeping an idea
 *   moderate  leaves a mark: commits, branches, pushes, PRs, edits in a checkout that is on main, spending money
 *   expensive hard to undo or outward-facing: main, force, deletes, merges, publishing, anything outside the checkout
 */
import { resolve, sep } from 'node:path'

export type Risk = 'free' | 'cheap' | 'moderate' | 'expensive'
export const RISKS: Risk[] = ['free', 'cheap', 'moderate', 'expensive']
export const rank = (r: Risk) => RISKS.indexOf(r)

export interface RiskContext { cwd: string; branch?: string | null } // branch: what the checkout at cwd has checked out

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'TodoWrite', 'WebFetch', 'WebSearch'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const ENGINE_FREE = new Set(['now', 'plans', 'plan_graph', 'ideas', 'events'])
const ENGINE: Record<string, [Risk, string]> = {
  create_idea: ['cheap', 'keeps an idea; easy to drop'],
  create_plan: ['cheap', 'a draft plan; nothing runs'],
  plan_task: ['moderate', 'runs the planner: minutes and money'],
  answer_question: ['moderate', "answers a question on the person's behalf"],
  cancel_plan: ['moderate', 'stops running agents'],
  start_plan: ['expensive', 'runs agents, spends money, opens a pull request'],
}

const RO = /^\s*(git\s+(status|log|diff|show|blame|ls-files|rev-parse|branch(\s+(-a|-r|--list|-v+))?|remote\s+-v|worktree\s+list|stash\s+list)|ls|cat|head|tail|wc|grep|rg|find|tree|pwd|echo|which|env|printenv|node\s+-v|pnpm\s+-v|npm\s+-v|python3?\s+--version|uname|date|whoami|du|df|stat|file|jq|sed\s+-n|awk|sort|uniq|cut|tr|diff|curl\s+-s\S*\s+(https?:\/\/)?(localhost|127\.0\.0\.1))\b/
const BUILD = /^\s*(pnpm|npm|yarn|npx|bun)\s+(test|run\s+test|typecheck|run\s+typecheck|build|run\s+build|lint|run\s+lint|exec\s+(tsc|vitest|eslint|oxlint|prettier)|-s\s+(test|typecheck|build|lint)|-r\s+(test|typecheck|build))\b|^\s*(pytest|vitest|tsc|cargo\s+(test|check|build)|go\s+(test|build|vet)|make\s+(test|check|build))\b|^\s*pnpm\s+install\b/
const EXPENSIVE = /\b(git\s+push\s+.*(\bmain\b|\bmaster\b|--force|-f\b)|git\s+push\s+--force|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|git\s+branch\s+-D\s+(main|master)\b|git\s+rebase|rm\s+-rf?\s|rm\s+-fr?\s|gh\s+pr\s+merge|gh\s+repo\s+(delete|rename|edit|archive)|gh\s+release|pnpm\s+publish|npm\s+publish|docker\s+(rm|rmi|volume\s+rm|system\s+prune)|dropdb|DROP\s+(TABLE|DATABASE)|truncate|sudo\s|chmod\s+-R|chown\s+-R|kill\s+-9|pkill|mkfs|dd\s+if=|curl\s+.*-X\s*(POST|PUT|PATCH|DELETE)\s+(?!.*(localhost|127\.0\.0\.1))|ssh\s|scp\s)/i
const MODERATE = /\b(git\s+(add|commit|checkout|switch|branch|merge|cherry-pick|stash|worktree|push|fetch|pull|tag|mv|rm|restore)|gh\s+(pr|issue|api|repo\s+clone)|pnpm\s+(add|remove|up|update|link)|npm\s+(install|i|add|remove|uninstall|update)|docker\s|docker-compose|mkdir|mv\s|cp\s|touch|curl\s+.*-X\s*(POST|PUT|PATCH|DELETE)|psql|createdb|tsx\s|node\s|python3?\s|uvicorn|open\s)\b/

export function riskOf(tool: string, input: Record<string, unknown>, ctx: RiskContext): { risk: Risk; why: string } {
  if (READ_TOOLS.has(tool)) return { risk: 'free', why: 'reads' }
  if (tool.startsWith('mcp__engine__')) {
    const name = tool.slice('mcp__engine__'.length)
    if (ENGINE_FREE.has(name)) return { risk: 'free', why: 'reads the engine' }
    const e = ENGINE[name]
    return e ? { risk: e[0], why: e[1] } : { risk: 'moderate', why: 'an engine action' }
  }
  if (EDIT_TOOLS.has(tool)) {
    const file = String(input.file_path ?? input.notebook_path ?? '')
    const root = resolve(ctx.cwd) + sep
    if (!file || !(resolve(ctx.cwd, file) + sep).startsWith(root)) return { risk: 'expensive', why: 'edits outside the checkout' }
    if (!ctx.branch || ctx.branch === 'main' || ctx.branch === 'master') return { risk: 'moderate', why: `edits a checkout that is on ${ctx.branch ?? 'an unknown branch'}; main is production` }
    return { risk: 'cheap', why: `edits on branch ${ctx.branch}` }
  }
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '')
    if (EXPENSIVE.test(cmd)) return { risk: 'expensive', why: 'hard to undo, or outward-facing' }
    const writes = /(^|[^2&])>(?!\s*\/dev\/null)/.test(cmd.replace(/2>&1/g, '')) // a redirect is a write, unless it only discards
    if (writes && !BUILD.test(cmd)) return { risk: 'moderate', why: 'writes a file through a redirect' }
    if (/[|;&`$]/.test(cmd) && !BUILD.test(cmd)) {
      // Pipes can hide a write; a pipeline of known readers is still free.
      const parts = cmd.replace(/2>&1/g, '').split(/\|\||&&|\||;/).map((p) => p.trim()).filter(Boolean)
      if (parts.length && parts.every((p) => RO.test(p))) return { risk: 'free', why: 'a read-only pipeline' }
    }
    if (RO.test(cmd)) return { risk: 'free', why: 'a read-only command' }
    if (BUILD.test(cmd)) return { risk: 'cheap', why: 'tests, typecheck or build; changes nothing of record' }
    if (MODERATE.test(cmd)) return { risk: 'moderate', why: 'leaves a mark: commits, branches, pushes, installs or runs a process' }
    return { risk: 'moderate', why: 'a command the engine does not recognise' }
  }
  return { risk: 'expensive', why: `${tool} is not a tool this agent has` }
}
