/** The engine's API, as the UI sees it. In development Vite proxies /api → the engine; the UI never touches the database. */
import { useEffect, useRef, useState } from 'react'

export const API = '/api'

// idea → plan (tasks in order) → task (title + brief) → phase (one agent, one worktree, one commit) → step (the builder's todo list)
export type PhaseStatus = 'queued' | 'ready' | 'running' | 'awaiting_answer' | 'merging' | 'testing' | 'done' | 'failed' | 'cancelled'

export interface Run { id: string; attempt: number; status: string; model: string | null; costUsd: string | null; summary: string | null; error: string | null; startedAt: string; endedAt: string | null }
export interface Step { id: number; position: number; text: string; status: 'pending' | 'in_progress' | 'completed' }
export interface GraphPhase {
  id: string; number: number; title: string; brief: string | null; status: PhaseStatus; attempt: number; maxAttempts: number
  planId: string; taskId: string; branch: string | null; heldReason: string | null
  dependsOn: string[]; orderedAfter?: string[] // explicit dependencies; and task order, drawn (finishers of the task before)
  files: string[]; lastRun: Run | null; steps?: Step[]
}
export interface GraphTask { id: string; number: number; position: number; title: string; brief: string | null; phaseIds: string[] }
// What the planner settled (provisional until a person approves) and what it could not.
export interface Decision { id: string; taskId: string | null; question: string; options: { key: string; text: string; recommended: boolean }[]; chosen: string | null; provisional: boolean; rationale: string | null }
export interface Question { id: string; taskId: string | null; text: string; options: { label: string; description: string; changes: string[]; recommended: boolean }[]; reason: string | null; cost: 'cheap' | 'moderate' | 'expensive' | null; status: string; answer: string | null }
export interface Graph {
  plan: { id: string; title: string; status: string; integrationBranch: string | null; spec: string | null; createdAt: string }
  app: { id: string; name: string; defaultBranch: string }
  pr: { number: number; url: string; status: string } | null
  tasks: GraphTask[]
  phases: GraphPhase[]
  decisions: Decision[]
  questions: Question[]
  conflicts: [string, string][] // open phases that claim the same path: they take turns
}
export interface PlanSummary { id: string; title: string; status: string; createdAt: string; app: { id: string; name: string } | null; taskCount: number; phases: Record<string, number> }
export interface AppSetup { test_cmd?: string; preview_cmd?: string; model?: string; max_budget_usd?: number; max_turns?: number }
export interface Repo { id: string; appId: string; fullName: string; localPath: string | null; baseBranch: string | null }
export interface App { id: string; workspaceId?: string; name: string; defaultBranch: string; setup?: AppSetup; repos?: Repo[] }
export interface Workspace { id: string; name: string }
export interface Event { seq: number; ts: string; type: string; actor: string; taskId: string | null; phaseId: string | null; planId: string | null; payload: Record<string, unknown> }
export interface NewPhase { key: string; title: string; brief?: string; dependsOn?: string[]; files?: string[] }
export interface NewTask { title: string; brief?: string; phases?: NewPhase[] }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${res.status}`)
  return JSON.parse(text) as T
}

// The front door (GET /now): what's running, what needs a person, what just happened.
export type Attention =
  | { kind: 'failed_phase'; planId: string; planTitle: string; appName: string; phaseId: string; number: number; title: string; error: string | null }
  | { kind: 'question'; planId: string; planTitle: string; appName: string; questionId: string; taskNumber: number | null; text: string; cost: string | null; askedAt: string }
  | { kind: 'run_plan'; planId: string; planTitle: string; appName: string; phases: number }
  | { kind: 'plan_task'; planId: string; planTitle: string; appName: string; taskId: string; taskNumber: number; taskTitle: string }
  | { kind: 'merge_pr'; planId: string; planTitle: string; appName: string; prNumber: number | null; url: string | null }
export interface RunningPlan {
  planId: string; planTitle: string; appName: string; status: string; integrationBranch: string | null
  phases: { total: number; done: number; failed: number }
  live: { id: string; number: number; title: string; status: PhaseStatus; step: string | null }[]
  held: { id: string; number: number; title: string; reason: string | null }[]
  pr: { number: number | null; url: string | null; status: string } | null
}
export interface Now { running: RunningPlan[]; needsYou: Attention[]; recent: Event[]; counts: { plans: number; running: number; needsYou: number } }

export const engine = {
  now: () => call<Now>('GET', '/now'),
  apps: () => call<App[]>('GET', '/apps'),
  workspaces: () => call<Workspace[]>('GET', '/workspaces'),
  createWorkspace: (name: string) => call<Workspace>('POST', '/workspaces', { name }),
  createApp: (body: { workspaceId: string; name: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('POST', '/apps', body),
  updateApp: (id: string, body: { name?: string; defaultBranch?: string; setup?: AppSetup }) => call<App>('PATCH', `/apps/${id}`, body),
  createRepo: (body: { appId: string; fullName: string; localPath?: string; baseBranch?: string }) => call<Repo>('POST', '/repos', body),
  updateRepo: (id: string, body: { fullName?: string; localPath?: string | null; baseBranch?: string | null }) => call<Repo>('PATCH', `/repos/${id}`, body),
  plans: () => call<PlanSummary[]>('GET', '/plans'),
  graph: (id: string) => call<Graph>('GET', `/plans/${id}/graph`),
  createPlan: (body: { appId: string; title: string; spec?: string; tasks: NewTask[] }) => call<{ plan: { id: string } }>('POST', '/plans', body),
  addPhases: (taskId: string, phases: NewPhase[]) => call<unknown>('POST', `/tasks/${taskId}/phases`, phases),
  planTask: (taskId: string) => call<{ runId: string }>('POST', `/tasks/${taskId}/plan`), // 202; the outcome arrives as task.planned / task.plan_failed
  clearPhases: (taskId: string) => call<{ cleared: number }>('DELETE', `/tasks/${taskId}/phases`), // a draft task back to its brief
  cancelPlan: (planId: string) => call<{ cancelled: number; landed: number }>('POST', `/plans/${planId}/cancel`),
  answer: (questionId: string, answer: string) => call<unknown>('POST', `/questions/${questionId}/answer`, { answer }),
  start: (id: string) => call<unknown>('POST', `/plans/${id}/start`),
  tick: (id: string) => call<unknown>('POST', `/plans/${id}/tick`),
  setStatus: (phaseId: string, status: PhaseStatus) => call<unknown>('POST', `/phases/${phaseId}/status`, { status }),
}

export const EVENT_TYPES = [
  'plan.created', 'plan.started', 'plan.landed', 'plan.cleaned', 'task.created',
  'task.planning', 'task.planned', 'task.plan_failed', 'task.cleared', 'plan.cancelled', 'question.asked', 'question.answered',
  'phase.created', 'phase.status', 'phase.held', 'phase.retry', 'phase.failed', 'phase.error', 'phase.interrupted',
  'run.started', 'run.message', 'run.steps', 'run.tool_call', 'run.tool_result', 'run.result', 'run.error', 'run.rate_limit',
  'land.committed', 'land.tested', 'land.landed', 'land.conflict', 'land.retry', 'pr.opened', 'pr.updated', 'pr.error',
]

/** A plan's graph, refreshed whenever the engine logs an event for it; plus the recent events themselves. */
export function useLivePlan(planId: string | undefined) {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!planId) return
    let closed = false
    const refresh = () => engine.graph(planId).then((g) => { if (!closed) setGraph(g) }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?plan=${planId}`)
    const onAny = (ev: MessageEvent) => {
      const e = JSON.parse(ev.data) as Event
      setEvents((prev) => [...prev.slice(-199), e])
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(refresh, 150) // one refetch per burst of events
    }
    for (const type of EVENT_TYPES) es.addEventListener(type, onAny as EventListener)
    es.onerror = () => setError('event stream disconnected; retrying')
    es.onopen = () => setError(null)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [planId])
  return { graph, events, error }
}
