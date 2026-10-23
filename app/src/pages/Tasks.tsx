/** Tasks: every task of the current app's plans, where each stands, and Plan on the ones with no phases yet. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { engine, type TaskRow } from '../engine'
import { useCurrentApp } from '../current-app'

function standing(t: TaskRow): { label: string; tone: Tone } {
  const total = Object.values(t.phases).reduce((a, b) => a + b, 0)
  const done = t.phases.done ?? 0
  if (t.planning === 'task.planning') return { label: 'planning…', tone: 'accent' }
  if (t.planning === 'task.plan_waiting') return { label: 'waiting for the model', tone: 'warn' }
  if (!total) return t.planning === 'task.plan_failed' ? { label: 'planning failed', tone: 'bad' } : { label: 'no phases yet', tone: 'neutral' }
  if (t.phases.failed) return { label: `${t.phases.failed} failed · ${done}/${total} landed`, tone: 'bad' }
  if (done === total) return { label: `${total} landed`, tone: 'ok' }
  if (t.phases.running || t.phases.merging || t.phases.testing) return { label: `${done}/${total} landed · running`, tone: 'accent' }
  return { label: `${done}/${total} landed`, tone: 'neutral' }
}

export function Tasks() {
  const { app } = useCurrentApp()
  const [rows, setRows] = useState<TaskRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const reload = () => { if (app) engine.tasks(app.id).then(setRows).catch((e) => setError(String(e.message ?? e))) }
  useEffect(() => { setRows(null); reload() }, [app?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const plan = async (id: string) => { setBusy(id); try { await engine.planTask(id); reload() } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(null) } }
  const draft = (s: string) => ['drafting', 'proposed', 'approved'].includes(s)
  return (
    <>
      <div className="page-head"><div>
        <h1>📋 Tasks{app ? <span className="muted" style={{ fontWeight: 400 }}> · {app.name}</span> : null}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>Every task of every plan: what it will change, and where it stands. A task becomes phases when it is planned.</p>
      </div></div>
      {error && <div className="empty bad">{error}</div>}
      {rows && !rows.length && <div className="empty">No tasks yet. Start a plan, or make an idea a task.</div>}
      {rows && rows.length > 0 && (
        <ul className="list panel" style={{ padding: '4px 18px' }}>
          {rows.map((t) => { const s = standing(t); const noPhases = !Object.values(t.phases).reduce((a, b) => a + b, 0); return (
            <li key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <Link to={`/plans/${t.plan.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>#{t.number} {t.title}</Link>
                {t.description && <div className="muted" style={{ fontSize: 14, margin: '2px 0' }}>{t.description}</div>}
                <div className="faint" style={{ fontSize: 13 }}>in <Link to={`/plans/${t.plan.id}`}>{t.plan.title}</Link> · {t.plan.status}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Badge tone={s.tone} dot={s.tone === 'accent'}>{s.label}</Badge>
                {noPhases && draft(t.plan.status) && !['task.planning', 'task.plan_waiting'].includes(t.planning ?? '') && <button className="btn small" disabled={busy === t.id} onClick={() => plan(t.id)}>Plan</button>}
              </div>
            </li>) })}
        </ul>
      )}
    </>
  )
}
