/** One plan, live: the graph, the selected task's detail, the event ticker, and the plan's PR. */
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView, STATUS_TONE } from '../components/PlanGraphView'
import { engine, useLivePlan, type Event, type GraphTask } from '../engine'

const PLAN_TONE: Record<string, Tone> = { drafting: 'neutral', proposed: 'neutral', approved: 'neutral', running: 'accent', landed: 'ok', superseded: 'neutral' }

export function PlanPage() {
  const { id } = useParams()
  const { graph, events, error } = useLivePlan(id)
  const [selectedId, setSelectedId] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (error && !graph) return <p className="muted">{error}</p>
  if (!graph) return <p className="muted">Loading…</p>
  const selected = graph.tasks.find((t) => t.id === selectedId) ?? null
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  return (
    <>
      <p className="mono"><Link to="/plans">← Plans</Link></p>
      <div className="page-head">
        <div>
          <h1>{graph.plan.title}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Badge tone={PLAN_TONE[graph.plan.status] ?? 'neutral'} dot={graph.plan.status === 'running'}>{graph.plan.status}</Badge>
            <Badge>{graph.app.name}</Badge>
            {graph.plan.integrationBranch && <Badge><span className="mono">{graph.plan.integrationBranch}</span></Badge>}
            {graph.pr && <a className="badge accent" href={graph.pr.url} target="_blank" rel="noreferrer">PR #{graph.pr.number} · {graph.pr.status}</a>}
            {error && <Badge tone="warn" dot>{error}</Badge>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['drafting', 'proposed', 'approved'].includes(graph.plan.status) && (
            <button className="btn" disabled={busy} onClick={() => act(() => engine.start(graph.plan.id))}>Run this plan</button>
          )}
        </div>
      </div>

      <PlanGraphView tasks={graph.tasks} selectedId={selectedId} onSelect={(t) => setSelectedId(t.id)} />

      <div className="plan-lower">
        <section className="panel">
          {selected ? <TaskDetail task={selected} planStatus={graph.plan.status} busy={busy} act={act} /> : <p className="muted" style={{ margin: 0 }}>Click a task to see its brief, files, dependencies and last run.</p>}
        </section>
        <section className="panel">
          <h2>Events</h2>
          <Ticker events={events} tasks={graph.tasks} />
        </section>
      </div>
    </>
  )
}

function TaskDetail({ task, planStatus, busy, act }: { task: GraphTask; planStatus: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const manual = planStatus !== 'running' // the executor owns running plans; by hand only for drafts and demos
  return (
    <>
      <h2>#{task.number} {task.title} <Badge tone={STATUS_TONE[task.status]}>{task.status.replace('_', ' ')}</Badge></h2>
      <dl className="fields">
        <dt>Brief</dt><dd>{task.brief || <span className="faint">None.</span>}</dd>
        <dt>Files</dt><dd>{task.files.length ? <span className="mono">{task.files.join(', ')}</span> : <span className="faint">None declared: shares with everyone.</span>}</dd>
        <dt>Depends on</dt><dd>{task.dependsOn.length ? task.dependsOn.length + ' task' + (task.dependsOn.length > 1 ? 's' : '') : <span className="faint">Nothing.</span>}</dd>
        <dt>Held</dt><dd>{task.heldReason ?? <span className="faint">Not held.</span>}</dd>
        <dt>Branch</dt><dd>{task.branch ? <span className="mono">{task.branch}</span> : <span className="faint">Not started.</span>}</dd>
        <dt>Attempts</dt><dd>{task.attempt} of {task.maxAttempts}</dd>
        {task.lastRun && <><dt>Last run</dt><dd>{task.lastRun.status}{task.lastRun.model ? ` · ${task.lastRun.model}` : ''}{task.lastRun.costUsd ? ` · $${Number(task.lastRun.costUsd).toFixed(2)} est.` : ''}
          {task.lastRun.summary && <div className="summary">{task.lastRun.summary}</div>}
          {task.lastRun.error && <div className="summary bad">{task.lastRun.error}</div>}</dd></>}
      </dl>
      {manual && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="faint mono" style={{ alignSelf: 'center' }}>by hand:</span>
          {(['running', 'done', 'failed', 'queued'] as const).map((s) => (
            <button key={s} className="btn quiet" disabled={busy || task.status === s} onClick={() => act(() => engine.setStatus(task.id, s))}>{s}</button>
          ))}
        </div>
      )}
    </>
  )
}

function Ticker({ events, tasks }: { events: Event[]; tasks: GraphTask[] }) {
  const num = (id: string | null) => { const t = tasks.find((x) => x.id === id); return t ? `#${t.number}` : '' }
  const shown = events.filter((e) => !['run.tool_result', 'run.rate_limit'].includes(e.type)).slice(-40).reverse()
  if (!shown.length) return <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>
  return (
    <ul className="ticker">
      {shown.map((e) => (
        <li key={e.seq}>
          <span className="mono faint">{e.ts.slice(11, 19)}</span>
          <span className="mono">{num(e.taskId)}</span>
          <span className="mono">{e.type}</span>
          <span className="muted">{summarise(e)}</span>
        </li>
      ))}
    </ul>
  )
}

function summarise(e: Event): string {
  const p = e.payload as any
  switch (e.type) {
    case 'task.status': return `${p.from} → ${p.to}${p.why ? ` (${p.why})` : ''}`
    case 'task.held': return p.reason
    case 'task.retry': return `attempt ${p.attempt} of ${p.max}: ${String(p.why).slice(0, 120)}`
    case 'run.tool_call': return `${p.tool} ${p.input?.command ?? p.input?.file ?? p.input?.pattern ?? ''}`.slice(0, 120)
    case 'run.message': return String(p.text).slice(0, 160)
    case 'run.result': return `${p.subtype} · ${p.turns} turns · $${Number(p.costUsd ?? 0).toFixed(2)} est.`
    case 'land.tested': return p.ok ? 'tests passed on the merged commit' : `tests failed (exit ${p.code})`
    case 'land.landed': return `fast-forwarded ${p.integrationBranch} to ${String(p.sha).slice(0, 7)}`
    case 'pr.opened': case 'pr.updated': return `#${p.number} · ${p.landed} landed`
    default: return Object.keys(p).length ? JSON.stringify(p).slice(0, 120) : ''
  }
}
