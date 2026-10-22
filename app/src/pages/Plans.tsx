/** Plan: the drafts being planned (tasks, the planner's phases and questions). Build: what is running and what landed. Same list, two halves. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { engine, type PlanSummary } from '../engine'
import { useCurrentApp } from '../current-app'

const TONE: Record<string, Tone> = { running: 'accent', landed: 'ok', drafting: 'neutral' }
const DRAFT = ['drafting', 'proposed', 'approved']

export function Plans({ mode }: { mode: 'plan' | 'build' }) {
  const { app } = useCurrentApp()
  const [plans, setPlans] = useState<PlanSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setPlans(null); if (app) engine.plans(app.id).then(setPlans).catch((e) => setError(String(e.message ?? e))) }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = plans?.filter((p) => (mode === 'plan' ? DRAFT.includes(p.status) : !DRAFT.includes(p.status))) ?? null
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{mode === 'plan' ? '📋 Plan' : '🔨 Build'}{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {mode === 'plan'
              ? 'A plan is tasks in order, each a title and a brief. The planner turns a task into phases and asks what it cannot settle. When every task has phases and nothing is open, it is ready to build.'
              : 'Each phase is one agent in one worktree; what lands becomes the plan\'s PR. The Graph shows every phase of every plan and what each one waits on.'}
          </p>
        </div>
        {mode === 'plan' ? <Link to="/plans/new" className="btn">New plan</Link> : <Link to="/graph" className="btn quiet">Graph</Link>}
      </div>
      {error && <div className="empty">The engine isn't reachable: {error}. Start it with <code>pnpm dev</code> at the repo root.</div>}
      {!app && <div className="empty">No app yet. Add one in Settings.</div>}
      {shown && !shown.length && <div className="empty">{mode === 'plan' ? 'Nothing being planned. Keep an idea and make it a task, or start a plan.' : 'Nothing running or landed yet. Plans run from the Plan page once they have phases.'}</div>}
      {shown && shown.length > 0 && (
        <ul className="list panel" style={{ padding: '4px 18px' }}>
          {shown.map((p) => {
            const total = Object.values(p.phases).reduce((a, b) => a + b, 0)
            return (
              <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <Link to={`/plans/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.title}</Link>
                  <div className="faint" style={{ fontSize: 13 }}>{p.taskCount} task{p.taskCount === 1 ? '' : 's'} · {total} phase{total === 1 ? '' : 's'}
                    {p.phases.done ? ` · ${p.phases.done} done` : ''}{p.phases.failed ? ` · ${p.phases.failed} failed` : ''} · <span className="mono">{p.id}</span></div>
                </div>
                <Badge tone={TONE[p.status] ?? 'neutral'} dot={p.status === 'running'}>{p.status}</Badge>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
