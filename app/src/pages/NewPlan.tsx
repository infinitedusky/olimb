/**
 * The composer: a plan as rows of tasks (title, brief, depends on, files), straight into the engine.
 * The planning agent that proposes these rows from a description comes next and fills the same form.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { engine, type App } from '../engine'

interface Row { key: string; title: string; brief: string; dependsOn: string[]; files: string }
const blank = (i: number): Row => ({ key: `t${i}`, title: '', brief: '', dependsOn: [], files: '' })

export function NewPlan() {
  const nav = useNavigate()
  const [apps, setApps] = useState<App[]>([])
  const [appId, setAppId] = useState('')
  const [title, setTitle] = useState('')
  const [spec, setSpec] = useState('')
  const [rows, setRows] = useState<Row[]>([blank(1), blank(2)])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { engine.apps().then((a) => { setApps(a); if (a[0]) setAppId(a[0].id) }).catch((e) => setError(String(e.message ?? e))) }, [])

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i).map((r) => ({ ...r, dependsOn: r.dependsOn.filter((k) => k !== rs[i].key) })))
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const tasks = rows.filter((r) => r.title.trim()).map((r) => ({
        key: r.key, title: r.title.trim(), brief: r.brief.trim() || undefined, dependsOn: r.dependsOn,
        files: r.files.split(',').map((f) => f.trim()).filter(Boolean),
      }))
      if (!tasks.length) throw new Error('add at least one task with a title')
      const { plan } = await engine.createPlan({ appId, title: title.trim(), spec: spec.trim() || undefined, tasks })
      nav(`/plans/${plan.id}`)
    } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }

  return (
    <>
      <p className="mono"><Link to="/plans">← Plans</Link></p>
      <div className="page-head"><h1>New plan</h1></div>
      <section className="panel">
        <div className="form-grid">
          <label>App<select value={appId} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What this plan changes, in a line" /></label>
          <label style={{ gridColumn: '1 / -1' }}>Why (optional)<textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={2} placeholder="The idea or hypothesis behind it; goes in the PR" /></label>
        </div>
      </section>
      <section className="panel">
        <h2>Tasks</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>Each task runs as its own agent in its own worktree. Declare the files it will touch; two tasks that share a file never run at once. A task starts only after the tasks it depends on have landed.</p>
        {rows.map((r, i) => (
          <div className="task-row" key={r.key} data-component="TaskRow">
            <div className="mono faint">{i + 1}</div>
            <div className="form-grid">
              <label>Title<input value={r.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Add a GET /health endpoint" /></label>
              <label>Files (comma-separated)<input className="mono" value={r.files} onChange={(e) => update(i, { files: e.target.value })} placeholder="poc/hg/app.py, poc/tests/test_health.py" /></label>
              <label style={{ gridColumn: '1 / -1' }}>Brief<textarea value={r.brief} onChange={(e) => update(i, { brief: e.target.value })} rows={3} placeholder="What to do, what done looks like, what not to touch. The agent reads this and the repo's CLAUDE.md." /></label>
              <div style={{ gridColumn: '1 / -1' }}>
                <span className="label-text">Depends on</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {rows.filter((o) => o.key !== r.key && o.title.trim()).map((o) => (
                    <label key={o.key} className="inline"><input type="checkbox" checked={r.dependsOn.includes(o.key)}
                      onChange={(e) => update(i, { dependsOn: e.target.checked ? [...r.dependsOn, o.key] : r.dependsOn.filter((k) => k !== o.key) })} /> {o.title}</label>
                  ))}
                  {rows.filter((o) => o.key !== r.key && o.title.trim()).length === 0 && <span className="faint">No other titled tasks yet.</span>}
                </div>
              </div>
            </div>
            <button className="btn quiet" onClick={() => remove(i)} aria-label="remove task">×</button>
          </div>
        ))}
        <button className="btn quiet" onClick={() => setRows((rs) => [...rs, blank(rs.length + 1 + Math.floor(Math.random() * 1000))])}>+ Add a task</button>
      </section>
      {error && <div className="empty bad">{error}</div>}
      <p><button className="btn" disabled={busy || !title.trim() || !appId} onClick={submit}>Create plan</button> <span className="faint">You run it from the plan page.</span></p>
    </>
  )
}
