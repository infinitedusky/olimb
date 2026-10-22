/** Every plan the engine knows, newest first, and the way to make a new one. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { engine, type PlanSummary } from '../engine'
import { useCurrentApp } from '../current-app'

const TONE: Record<string, Tone> = { running: 'accent', landed: 'ok', drafting: 'neutral' }

export function Plans() {
  const { app } = useCurrentApp()
  const [plans, setPlans] = useState<PlanSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (app) engine.plans(app.id).then(setPlans).catch((e) => setError(String(e.message ?? e))) }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plans{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>A plan is tasks in order; each task becomes phases; the phases are the graph the engine runs.</p>
        </div>
        <Link to="/plans/new" className="btn">New plan</Link>
      </div>
      {error && <div className="empty">The engine isn't reachable: {error}. Start it with <code>pnpm serve</code> in <code>engine/</code>.</div>}
      {plans && !plans.length && <div className="empty">No plans yet.</div>}
      {plans && plans.length > 0 && (
        <ul className="list panel" style={{ padding: '4px 18px' }}>
          {plans.map((p) => {
            const total = Object.values(p.phases).reduce((a, b) => a + b, 0)
            return (
              <li key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <Link to={`/plans/${p.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{p.title}</Link>
                  <div className="faint" style={{ fontSize: 13 }}>{p.app?.name ?? 'no app'} · {p.taskCount} task{p.taskCount === 1 ? '' : 's'} · {total} phase{total === 1 ? '' : 's'}
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
