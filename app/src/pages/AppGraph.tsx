/**
 * The top level: every phase of every plan in an app, on one canvas. Dependencies as solid edges; unfinished phases
 * that share a file as dashed links (they will never run at once). Live over the app's event stream.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView } from '../components/PlanGraphView'
import { API, engine, EVENT_TYPES, type App, type GraphPhase } from '../engine'

interface AppGraphData {
  app: App
  plans: { id: string; title: string; status: string; pr: { number: number; url: string } | null }[]
  tasks: { id: string; planId: string; number: number; position: number; title: string }[]
  phases: GraphPhase[]
  conflicts: [string, string][]
}
const PLAN_TONE: Record<string, Tone> = { running: 'accent', landed: 'ok' }
const short = (t: string) => (t.length > 28 ? t.slice(0, 26).trimEnd() + '…' : t)

async function fetchAppGraph(appId: string): Promise<AppGraphData> {
  const res = await fetch(`${API}/apps/${appId}/graph`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function AppGraph() {
  const [params, setParams] = useSearchParams()
  const [apps, setApps] = useState<App[]>([])
  const appId = params.get('app') ?? undefined
  const setAppId = (id: string | undefined) => { if (id) setParams({ app: id }, { replace: true }) }
  const [data, setData] = useState<AppGraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => { engine.apps().then((a) => { setApps(a); if (!params.get('app') && a.length) setAppId(a[a.length - 1].id) }).catch((e) => setError(String(e.message ?? e))) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!appId) return
    let closed = false
    const refresh = () => fetchAppGraph(appId).then((g) => { if (!closed) setData(g) }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?app=${appId}&since=-1`)
    const bump = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(refresh, 200) }
    for (const type of EVENT_TYPES) if (!type.startsWith('run.tool') && type !== 'run.message') es.addEventListener(type, bump)
    es.onerror = () => setError('event stream disconnected; retrying'); es.onopen = () => setError(null)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [appId])

  const selected = data?.phases.find((p) => p.id === selectedId)
  const taskOf = (p: GraphPhase) => data?.tasks.find((t) => t.id === p.taskId)
  const planOf = (p: GraphPhase) => data?.plans.find((x) => x.id === p.planId)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Graph</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every phase of every plan. An arrow is a wait: the phase at its head starts after the one at its tail lands. Phases that touch the same file take turns; that shows on the node when it happens.</p>
        </div>
        {apps.length > 1 && <select value={appId} onChange={(e) => setAppId(e.target.value)}>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
      </div>
      {error && !data && <div className="empty">The engine isn't reachable: {error}</div>}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {data.plans.map((p) => (
              <Link key={p.id} to={`/plans/${p.id}`} className={`badge ${PLAN_TONE[p.status] ?? ''}`}>{p.title}{p.pr ? ` · PR #${p.pr.number}` : ''}</Link>
            ))}
            {error && <Badge tone="warn" dot>{error}</Badge>}
          </div>
          {data.phases.length
            ? <PlanGraphView phases={data.phases} labels={Object.fromEntries(data.phases.map((p) => [p.id, short(taskOf(p)?.title ?? planOf(p)?.title ?? '')]))} selectedId={selectedId} onSelect={(p) => setSelectedId(p.id)} tall />
            : <div className="empty">No phases in {data.app.name} yet.</div>}
          {selected && (
            <section className="panel">
              <h2>#{selected.number} {selected.title} <Badge>{planOf(selected)?.title}</Badge></h2>
              <dl className="fields">
                <dt>Status</dt><dd>{selected.status}{selected.heldReason ? ` — ${selected.heldReason}` : ''}</dd>
                <dt>Task</dt><dd>{taskOf(selected) ? `#${taskOf(selected)!.number} ${taskOf(selected)!.title}` : '—'}</dd>
                <dt>Files</dt><dd>{selected.files.length ? <span className="mono">{selected.files.join(', ')}</span> : <span className="faint">None declared: claims the whole app.</span>}</dd>
                <dt>Shares files with</dt><dd>{data.conflicts.filter((c) => c.includes(selected.id)).map((c) => c.find((x) => x !== selected.id)).map((id) => data.phases.find((p) => p.id === id)).filter(Boolean).map((p) => `#${p!.number} ${p!.title} (${planOf(p!)?.title})`).join('; ') || <span className="faint">Nothing open.</span>}</dd>
                <dt>Plan</dt><dd><Link to={`/plans/${selected.planId}`}>{planOf(selected)?.title}</Link></dd>
              </dl>
            </section>
          )}
        </>
      )}
    </>
  )
}
