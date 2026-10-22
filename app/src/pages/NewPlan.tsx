/**
 * The composer: a plan as tasks in order (title + brief, what you author), each with its phases. Phases are what the
 * planner will propose from the brief; until it exists you can write them here. Straight into the engine.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { engine } from '../engine'
import { useCurrentApp } from '../current-app'

interface PhaseRow { key: string; title: string; brief: string; dependsOn: string[]; files: string }
interface TaskRow { key: string; title: string; brief: string; phases: PhaseRow[] }
let seq = 0
const blankPhase = (): PhaseRow => ({ key: `p${++seq}`, title: '', brief: '', dependsOn: [], files: '' })
const blankTask = (): TaskRow => ({ key: `t${++seq}`, title: '', brief: '', phases: [] })

export function NewPlan() {
  const nav = useNavigate()
  const { apps, app } = useCurrentApp()
  const [appId, setAppId] = useState('')
  const [title, setTitle] = useState('')
  const [spec, setSpec] = useState('')
  const [tasks, setTasks] = useState<TaskRow[]>([blankTask()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [params] = useSearchParams()
  const ideaId = params.get('idea') // "Break it down" from the inbox: the idea becomes the plan's title and why, and the first task
  useEffect(() => {
    if (ideaId) engine.ideas().then((all) => {
      const i = all.find((x) => x.id === ideaId)
      if (!i) return
      setAppId(i.appId); setTitle(i.title); setSpec(i.body ?? '')
      setTasks([{ ...blankTask(), title: i.title, brief: i.body ?? '' }])
    }).catch(() => {})
  }, [ideaId])
  useEffect(() => { if (app && !appId) setAppId(app.id) }, [app, appId])

  const updateTask = (ti: number, patch: Partial<TaskRow>) => setTasks((ts) => ts.map((t, j) => (j === ti ? { ...t, ...patch } : t)))
  const updatePhase = (ti: number, pi: number, patch: Partial<PhaseRow>) => updateTask(ti, { phases: tasks[ti].phases.map((p, j) => (j === pi ? { ...p, ...patch } : p)) })
  const earlierPhases = (ti: number, pi: number) => tasks.slice(0, ti + 1).flatMap((t, j) => t.phases.filter((p, k) => (j < ti || k !== pi) && p.title.trim()))

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const body = tasks.filter((t) => t.title.trim()).map((t) => ({
        title: t.title.trim(), brief: t.brief.trim() || undefined,
        phases: t.phases.filter((p) => p.title.trim()).map((p) => ({
          key: p.key, title: p.title.trim(), brief: p.brief.trim() || undefined, dependsOn: p.dependsOn,
          files: p.files.split(',').map((f) => f.trim()).filter(Boolean),
        })),
      }))
      if (!body.length) throw new Error('add at least one task with a title')
      const { plan } = await engine.createPlan({ appId, title: title.trim(), spec: spec.trim() || undefined, ideaId: ideaId ?? undefined, tasks: body })
      nav(`/plans/${plan.id}`)
    } catch (e: any) { setError(String(e.message ?? e)) } finally { setBusy(false) }
  }

  return (
    <>
      <p className="mono"><Link to="/plan">← Plan</Link></p>
      <div className="page-head"><h1>New plan</h1></div>
      <section className="panel">
        <div className="form-grid">
          <label>App<select value={appId} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What this plan changes, in a line" /></label>
          <label style={{ gridColumn: '1 / -1' }}>Why (optional)<textarea value={spec} onChange={(e) => setSpec(e.target.value)} rows={2} placeholder="The idea or hypothesis behind it; goes in the PR" /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Tasks, in order</h2>
        <p className="muted" style={{ margin: '0 0 12px' }}>A task is a title and a brief: what to change and why. Tasks run in order. Each task becomes phases, one agent each in its own worktree; write them below or leave them for the planner.</p>
        {tasks.map((t, ti) => (
          <div className="task-block" key={t.key} data-component="TaskRow">
            <div className="task-block-head"><span className="mono faint">task {ti + 1}</span>
              <button className="btn quiet" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== ti))} aria-label="remove task">×</button></div>
            <div className="form-grid">
              <label>Title<input value={t.title} onChange={(e) => updateTask(ti, { title: e.target.value })} placeholder="Harden the POC" /></label>
              <label style={{ gridColumn: '1 / -1' }}>Brief<textarea value={t.brief} onChange={(e) => updateTask(ti, { brief: e.target.value })} rows={3} placeholder="What should be true when this is done, what's wrong today, what to avoid. The planner reads this and the repo." /></label>
            </div>
            <div className="phase-list">
              {t.phases.map((p, pi) => (
                <div className="task-row" key={p.key}>
                  <div className="mono faint">{ti + 1}.{pi + 1}</div>
                  <div className="form-grid">
                    <label>Phase<input value={p.title} onChange={(e) => updatePhase(ti, pi, { title: e.target.value })} placeholder="Add a GET /health endpoint" /></label>
                    <label>Files (comma-separated)<input className="mono" value={p.files} onChange={(e) => updatePhase(ti, pi, { files: e.target.value })} placeholder="poc/hg/app.py, poc/tests/test_health.py" /></label>
                    <label style={{ gridColumn: '1 / -1' }}>Brief<textarea value={p.brief} onChange={(e) => updatePhase(ti, pi, { brief: e.target.value })} rows={2} placeholder="What to do, what done looks like, what not to touch." /></label>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span className="label-text">Depends on</span>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {earlierPhases(ti, pi).map((o) => (
                          <label key={o.key} className="inline"><input type="checkbox" checked={p.dependsOn.includes(o.key)}
                            onChange={(e) => updatePhase(ti, pi, { dependsOn: e.target.checked ? [...p.dependsOn, o.key] : p.dependsOn.filter((k) => k !== o.key) })} /> {o.title}</label>
                        ))}
                        {earlierPhases(ti, pi).length === 0 && <span className="faint">No other titled phases yet. Task order already applies.</span>}
                      </div>
                    </div>
                  </div>
                  <button className="btn quiet" onClick={() => updateTask(ti, { phases: t.phases.filter((_, j) => j !== pi) })} aria-label="remove phase">×</button>
                </div>
              ))}
              <button className="btn quiet" onClick={() => updateTask(ti, { phases: [...t.phases, blankPhase()] })}>+ Add a phase</button>
            </div>
          </div>
        ))}
        <button className="btn quiet" onClick={() => setTasks((ts) => [...ts, blankTask()])}>+ Add a task</button>
      </section>
      {error && <div className="empty bad">{error}</div>}
      <p><button className="btn" disabled={busy || !title.trim() || !appId} onClick={submit}>Create plan</button> <span className="faint">You run it from the plan page once it has phases.</span></p>
    </>
  )
}
