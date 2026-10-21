/**
 * One plan, live: its tasks in order (plan one with a click), the phase graph, the planner's questions and
 * decisions, the selected phase's detail and steps, the event ticker, the PR.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView, STATUS_TONE } from '../components/PlanGraphView'
import { engine, useLivePlan, type Decision, type Event, type GraphPhase, type GraphTask, type Question } from '../engine'

const PLAN_TONE: Record<string, Tone> = { drafting: 'neutral', proposed: 'neutral', approved: 'neutral', running: 'accent', landed: 'ok', superseded: 'neutral' }
const COST_TONE: Record<string, Tone> = { cheap: 'neutral', moderate: 'warn', expensive: 'bad' }
const short = (t: string) => (t.length > 28 ? t.slice(0, 26).trimEnd() + '…' : t)

export function PlanPage() {
  const { id } = useParams()
  const { graph, events, error } = useLivePlan(id)
  const [selectedId, setSelectedId] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (error && !graph) return <p className="muted">{error}</p>
  if (!graph) return <p className="muted">Loading…</p>
  const selected = graph.phases.find((p) => p.id === selectedId) ?? null
  const taskOf = (p: GraphPhase) => graph.tasks.find((t) => t.id === p.taskId)
  const draft = ['drafting', 'proposed', 'approved'].includes(graph.plan.status)
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  // A task is being planned from its last planning event until the planner reports back.
  const planning = (taskId: string) => events.filter((e) => e.taskId === taskId && e.type.startsWith('task.plan')).at(-1)?.type === 'task.planning'
  const open = graph.questions.filter((q) => q.status === 'open')
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
          {graph.plan.spec && <p className="muted" style={{ margin: '8px 0 0', maxWidth: 720 }}>{graph.plan.spec}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {draft && graph.phases.length > 0 && (
            <button className="btn" disabled={busy} onClick={() => act(() => engine.start(graph.plan.id))}>Run this plan</button>
          )}
        </div>
      </div>

      <ol className="task-strip">
        {graph.tasks.map((t) => (
          <TaskChip key={t.id} task={t} phases={graph.phases.filter((p) => p.taskId === t.id)} planning={planning(t.id)}
            onPlan={draft && !planning(t.id) ? () => act(() => engine.planTask(t.id)) : undefined} busy={busy} />
        ))}
      </ol>

      {graph.phases.length
        ? <PlanGraphView phases={graph.phases} labels={Object.fromEntries(graph.phases.map((p) => [p.id, short(taskOf(p)?.title ?? '')]))} selectedId={selectedId} onSelect={(p) => setSelectedId(p.id)} />
        : <div className="empty">No phases yet. <strong>Plan</strong> a task above: the planner reads the repo and the task's brief and proposes phases, decisions and questions. Or write phases by hand with <code>pnpm if task phases</code>.</div>}

      {(graph.questions.length > 0 || graph.decisions.length > 0) && (
        <div className="plan-lower">
          <section className="panel">
            <h2>Questions {open.length > 0 && <Badge tone="warn">{open.length} open</Badge>}</h2>
            {graph.questions.length ? <div className="cards">{graph.questions.map((q) => <QuestionCard key={q.id} q={q} task={graph.tasks.find((t) => t.id === q.taskId)} busy={busy} act={act} />)}</div>
              : <p className="muted" style={{ margin: 0 }}>The planner had nothing to ask.</p>}
          </section>
          <section className="panel">
            <h2>Decisions</h2>
            {graph.decisions.length ? <div className="cards">{graph.decisions.map((d) => <DecisionCard key={d.id} d={d} task={graph.tasks.find((t) => t.id === d.taskId)} />)}</div>
              : <p className="muted" style={{ margin: 0 }}>Nothing settled yet.</p>}
          </section>
        </div>
      )}

      <div className="plan-lower">
        <section className="panel">
          {selected ? <PhaseDetail phase={selected} task={taskOf(selected)} planStatus={graph.plan.status} busy={busy} act={act} />
            : <p className="muted" style={{ margin: 0 }}>Click a phase to see its brief, files, dependencies, steps and last run.</p>}
        </section>
        <section className="panel">
          <h2>Events</h2>
          <Ticker events={events} phases={graph.phases} />
        </section>
      </div>
    </>
  )
}

function TaskChip({ task, phases, planning, onPlan, busy }: { task: GraphTask; phases: GraphPhase[]; planning: boolean; onPlan?: () => void; busy: boolean }) {
  const done = phases.filter((p) => p.status === 'done').length
  const live = phases.some((p) => ['running', 'merging', 'testing'].includes(p.status))
  const tone: Tone = phases.length && done === phases.length ? 'ok' : live ? 'accent' : 'neutral'
  return (
    <li className="task-chip" data-component="TaskChip" title={task.brief ?? undefined}>
      <span className="mono faint">task #{task.number}</span>
      <strong>{task.title}</strong>
      {planning ? <Badge tone="accent" dot>planning…</Badge>
        : phases.length ? <Badge tone={tone} dot={live}>{done}/{phases.length} phases</Badge>
        : onPlan ? <button className="btn quiet small" disabled={busy} onClick={onPlan}>Plan</button> : <Badge>no phases</Badge>}
    </li>
  )
}

function QuestionCard({ q, task, busy, act }: { q: Question; task?: GraphTask; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const rec = q.options.find((o) => o.recommended)
  return (
    <div className={`card ${q.status}`} data-component="QuestionCard">
      <div className="card-head">
        <span className="mono faint">{task ? `task #${task.number}` : ''}</span>
        <span style={{ display: 'flex', gap: 4 }}>
          {q.cost && <Badge tone={COST_TONE[q.cost]}>{q.cost}</Badge>}
          <Badge tone={q.status === 'open' ? 'warn' : 'ok'}>{q.status}</Badge>
        </span>
      </div>
      <div className="card-title">{q.text}</div>
      {q.status === 'open' ? (
        <>
          <div className="opts">
            {q.options.map((o) => (
              <button key={o.label} className={`btn quiet ${o.recommended ? 'rec' : ''}`} disabled={busy} title={o.description} onClick={() => act(() => engine.answer(q.id, o.label))}>
                {o.label}{o.recommended ? ' · recommended' : ''}{o.changes?.length ? ` · changes ${o.changes.join(', ')}` : ''}
              </button>
            ))}
          </div>
          {rec && q.reason && <div className="faint" style={{ marginTop: 6, fontSize: 13 }}>Why {rec.label}: {q.reason}</div>}
          {q.options.some((o) => o.description) && <ul className="faint" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{q.options.filter((o) => o.description).map((o) => <li key={o.label}><strong>{o.label}</strong>: {o.description}</li>)}</ul>}
        </>
      ) : <div style={{ marginTop: 6 }}>Answer: <strong>{q.answer}</strong>{rec && q.answer !== rec.label ? <span className="faint"> (the planner recommended {rec.label}; the phases assume it)</span> : null}</div>}
    </div>
  )
}

function DecisionCard({ d, task }: { d: Decision; task?: GraphTask }) {
  const chosen = d.options.find((o) => o.key === d.chosen) ?? d.options[0]
  const rejected = d.options.filter((o) => o !== chosen)
  return (
    <div className="card" data-component="DecisionCard">
      <div className="card-head">
        <span className="mono faint">{task ? `task #${task.number}` : ''}</span>
        {d.provisional && <Badge>provisional</Badge>}
      </div>
      <div className="card-title">{d.question}</div>
      <div style={{ marginTop: 4 }}>{chosen?.text}</div>
      {d.rationale && <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>{d.rationale}</div>}
      {rejected.length > 0 && <div className="faint" style={{ marginTop: 4, fontSize: 13 }}>Rejected: {rejected.map((o) => o.text).join('; ')}</div>}
    </div>
  )
}

function PhaseDetail({ phase, task, planStatus, busy, act }: { phase: GraphPhase; task?: GraphTask; planStatus: string; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const manual = planStatus !== 'running' // the executor owns running plans; by hand only for drafts and demos
  const steps = phase.steps ?? []
  return (
    <>
      <h2>#{phase.number} {phase.title} <Badge tone={STATUS_TONE[phase.status]}>{phase.status.replace('_', ' ')}</Badge></h2>
      <dl className="fields">
        <dt>Task</dt><dd>{task ? `#${task.number} ${task.title}` : '—'}</dd>
        <dt>Brief</dt><dd>{phase.brief ? <div className="brief">{phase.brief}</div> : <span className="faint">None.</span>}</dd>
        <dt>Files</dt><dd>{phase.files.length ? <span className="mono">{phase.files.join(', ')}</span> : <span className="faint">None declared: claims the whole app.</span>}</dd>
        <dt>Depends on</dt><dd>{phase.dependsOn.length ? `${phase.dependsOn.length} phase${phase.dependsOn.length > 1 ? 's' : ''}` : <span className="faint">Nothing explicit (task order still applies).</span>}</dd>
        <dt>Held</dt><dd>{phase.heldReason ?? <span className="faint">Not held.</span>}</dd>
        <dt>Branch</dt><dd>{phase.branch ? <span className="mono">{phase.branch}</span> : <span className="faint">Not started.</span>}</dd>
        <dt>Attempts</dt><dd>{phase.attempt} of {phase.maxAttempts}</dd>
        {steps.length > 0 && <><dt>Steps</dt><dd>
          <ul className="steps">{steps.map((s) => <li key={s.id} className={s.status}><span className="mono">{s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'}</span> {s.text}</li>)}</ul>
        </dd></>}
        {phase.lastRun && <><dt>Last run</dt><dd>{phase.lastRun.status}{phase.lastRun.model ? ` · ${phase.lastRun.model}` : ''}{phase.lastRun.costUsd ? ` · $${Number(phase.lastRun.costUsd).toFixed(2)} est.` : ''}
          {phase.lastRun.summary && <div className="summary">{phase.lastRun.summary}</div>}
          {phase.lastRun.error && <div className="summary bad">{phase.lastRun.error}</div>}</dd></>}
      </dl>
      {manual && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="faint mono" style={{ alignSelf: 'center' }}>by hand:</span>
          {(['running', 'done', 'failed', 'queued'] as const).map((s) => (
            <button key={s} className="btn quiet" disabled={busy || phase.status === s} onClick={() => act(() => engine.setStatus(phase.id, s))}>{s}</button>
          ))}
        </div>
      )}
    </>
  )
}

function Ticker({ events, phases }: { events: Event[]; phases: GraphPhase[] }) {
  const num = (id: string | null) => { const p = phases.find((x) => x.id === id); return p ? `#${p.number}` : '' }
  const shown = events.filter((e) => !['run.tool_result', 'run.rate_limit'].includes(e.type)).slice(-40).reverse()
  if (!shown.length) return <p className="muted" style={{ margin: 0 }}>Nothing yet.</p>
  return (
    <ul className="ticker">
      {shown.map((e) => (
        <li key={e.seq}>
          <span className="mono faint">{e.ts.slice(11, 19)}</span>
          <span className="mono">{num(e.phaseId)}</span>
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
    case 'phase.status': return `${p.from} → ${p.to}${p.why ? ` (${p.why})` : ''}`
    case 'phase.held': return p.reason
    case 'phase.retry': return `attempt ${p.attempt} of ${p.max}: ${String(p.why).slice(0, 120)}`
    case 'task.planning': return `the planner is reading the repo (attempt ${p.attempt})`
    case 'task.planned': return `${(p.phases ?? []).length} phases · ${p.decisions} decisions · ${p.questions} questions${p.costUsd != null ? ` · $${Number(p.costUsd).toFixed(2)} est.` : ''}`
    case 'task.plan_failed': return String(p.error).slice(0, 160)
    case 'question.asked': return `[${p.cost}] ${p.text}`
    case 'question.answered': return String(p.answer)
    case 'run.steps': return `${(p.steps ?? []).filter((s: any) => s.status === 'completed').length}/${(p.steps ?? []).length} steps`
    case 'run.tool_call': return `${p.tool} ${p.input?.command ?? p.input?.file ?? p.input?.pattern ?? ''}`.slice(0, 120)
    case 'run.message': return String(p.text).slice(0, 160)
    case 'run.result': return `${p.subtype} · ${p.turns} turns · $${Number(p.costUsd ?? 0).toFixed(2)} est.`
    case 'land.tested': return p.ok ? 'tests passed on the merged commit' : `tests failed (exit ${p.code})`
    case 'land.landed': return `fast-forwarded ${p.integrationBranch} to ${String(p.sha).slice(0, 7)}`
    case 'pr.opened': case 'pr.updated': return `#${p.number} · ${p.landed} landed`
    default: return Object.keys(p).length ? JSON.stringify(p).slice(0, 120) : ''
  }
}
