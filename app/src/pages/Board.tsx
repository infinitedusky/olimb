/**
 * Ideas: the inbox first (rows in the engine: type it, it's kept; make it a plan when its time comes), then the
 * design-phase idea files below, as they were.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Idea } from '../ideas'
import { LANES } from '../ideas'
import { Badge } from '../components/Badge'
import { LaneColumn } from '../components/LaneColumn'
import { engine, type App, type IdeaRow, type PlanSummary } from '../engine'

export function Board({ ideas }: { ideas: Idea[] }) {
  const nav = useNavigate()
  const [apps, setApps] = useState<App[]>([])
  const [appId, setAppId] = useState('')
  const [rows, setRows] = useState<IdeaRow[] | null>(null)
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const reload = () => Promise.all([engine.ideas(), engine.plans()]).then(([i, p]) => { setRows(i); setPlans(p) }).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => {
    engine.apps().then((a) => { setApps(a); if (a.length) setAppId(a[a.length - 1].id) }).catch((e) => setError(String(e.message ?? e)))
    void reload()
  }, [])
  const add = async () => {
    if (!title.trim() || !appId) return
    setBusy('add')
    try { await engine.createIdea({ appId, title, body: body.trim() || undefined }); setTitle(''); setBody(''); await reload() } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(null) }
  }
  const makePlan = async (id: string) => {
    setBusy(id)
    try { const { plan } = await engine.planIdea(id); nav(`/plans/${plan.id}`) } catch (e: any) { setError(String(e.message ?? e)); setBusy(null) }
  }
  const planOf = (i: IdeaRow) => plans.find((p) => p.ideaId === i.id)
  const inbox = (rows ?? []).filter((r) => r.lane === 'inbox')
  const planned = (rows ?? []).filter((r) => r.lane !== 'inbox')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ideas</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Type it, it's kept. When its time comes, it becomes one task, or a plan of several.</p>
        </div>
        <span className="mono faint">{inbox.length} in the inbox</span>
      </div>

      <section className="panel">
        <div className="form-grid">
          <label style={{ gridColumn: '1 / -1' }}>Idea<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="One line: what should be true?" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void add() }} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Why, and anything already decided (optional)<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="This becomes the task's brief when the idea is planned." /></label>
          <label>App<select value={appId} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div style={{ alignSelf: 'end' }}><button className="btn" disabled={!title.trim() || !appId || busy === 'add'} onClick={add}>Keep it</button></div>
        </div>
        {error && <div className="empty bad" style={{ marginTop: 10 }}>{error}</div>}
      </section>

      <section className="panel">
        <h2>Inbox</h2>
        {rows === null ? <p className="muted">Loading…</p> : inbox.length === 0 ? <p className="muted" style={{ margin: 0 }}>Empty. Good.</p> : (
          <ul className="attention">
            {inbox.map((i) => (
              <li key={i.id}>
                <span className="mono faint">#{i.number}</span>
                <div><strong>{i.title}</strong>{i.body && <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{i.body}</div>}
                  <div className="faint" style={{ fontSize: 12 }}>{apps.find((a) => a.id === i.appId)?.name}</div></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn small" disabled={busy === i.id} onClick={() => makePlan(i.id)} title="A plan of one task: this title, this brief">Make it a task</button>
                  <Link className="btn quiet small" to={`/plans/new?idea=${i.id}`} title="A plan of several tasks, in order">Break it down</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {planned.length > 0 && (
          <p className="faint" style={{ margin: '12px 0 0', fontSize: 13 }}>Planned: {planned.map((i) => { const p = planOf(i); return p ? <span key={i.id}><Link to={`/plans/${p.id}`}>{i.title}</Link> <Badge>{p.status}</Badge> </span> : <span key={i.id}>{i.title} </span> })}</p>
        )}
      </section>

      <div className="page-head" style={{ marginTop: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>From the design notes</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>The ideas written as files in <code>ideas/</code> before the inbox existed. Every idea carries its evidence; telemetry decides.</p>
        </div>
        <span className="mono faint">{ideas.length} ideas</span>
      </div>
      <div className="lanes">
        {LANES.map((l) => <LaneColumn key={l.id} label={l.label} hint={l.hint} ideas={ideas.filter((i) => i.lane === l.id)} />)}
      </div>
    </>
  )
}
