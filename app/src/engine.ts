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
  dependsOn: string[]; files: string[]; lastRun: Run | null; steps?: Step[]
}
export interface GraphTask { id: string; number: number; position: number; title: string; brief: string | null; phaseIds: string[] }
export interface Graph {
  plan: { id: string; title: string; status: string; integrationBranch: string | null; spec: string | null; createdAt: string }
  app: { id: string; name: string; defaultBranch: string }
  pr: { number: number; url: string; status: string } | null
  tasks: GraphTask[]
  phases: GraphPhase[]
}
export interface PlanSummary { id: string; title: string; status: string; createdAt: string; app: { id: string; name: string } | null; taskCount: number; phases: Record<string, number> }
export interface App { id: string; name: string; defaultBranch: string }
export interface Event { seq: number; ts: string; type: string; actor: string; taskId: string | null; phaseId: string | null; planId: string | null; payload: Record<string, unknown> }
export interface NewPhase { key: string; title: string; brief?: string; dependsOn?: string[]; files?: string[] }
export interface NewTask { title: string; brief?: string; phases?: NewPhase[] }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${res.status}`)
  return JSON.parse(text) as T
}

export const engine = {
  apps: () => call<App[]>('GET', '/apps'),
  plans: () => call<PlanSummary[]>('GET', '/plans'),
  graph: (id: string) => call<Graph>('GET', `/plans/${id}/graph`),
  createPlan: (body: { appId: string; title: string; spec?: string; tasks: NewTask[] }) => call<{ plan: { id: string } }>('POST', '/plans', body),
  addPhases: (taskId: string, phases: NewPhase[]) => call<unknown>('POST', `/tasks/${taskId}/phases`, phases),
  start: (id: string) => call<unknown>('POST', `/plans/${id}/start`),
  tick: (id: string) => call<unknown>('POST', `/plans/${id}/tick`),
  setStatus: (phaseId: string, status: PhaseStatus) => call<unknown>('POST', `/phases/${phaseId}/status`, { status }),
}

export const EVENT_TYPES = [
  'plan.created', 'plan.started', 'plan.landed', 'plan.cleaned', 'task.created',
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
