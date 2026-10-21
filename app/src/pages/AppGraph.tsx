/**
 * The top level: every step of every plan in an app, on one canvas. Dependencies as solid edges; unfinished steps
 * that share a file as dashed links (they will never run at once). Live over the app's event stream.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge, type Tone } from '../components/Badge'
import { PlanGraphView } from '../components/PlanGraphView'
import { API, engine, type App, type GraphTask } from '../engine'

interface AppGraphData {
  app: App
  plans: { id: string; title: string; status: string; pr: { number: number; url: string } | null }[]
  tasks: (GraphTask & { planId: string })[]
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
    for (const type of ['plan.created', 'plan.started', 'plan.landed', 'task.created', 'task.status', 'task.held', 'task.retry', 'task.failed', 'run.started', 'run.result', 'land.landed', 'pr.opened', 'pr.updated']) {
      es.addEventListener(type, bump)
    }
    es.onerror = () => setError('event stream disconnected; retrying'); es.onopen = () => setError(null)
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [appId])

  const selected = data?.tasks.find((t) => t.id === selectedId)
  const planOf = (t: GraphTask & { planId: string }) => data?.plans.find((p) => p.id === t.planId)
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Graph</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Every step of every plan. Anything open and unblocked runs; steps that share a file take turns.</p>
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
          {data.tasks.length
            ? <PlanGraphView tasks={data.tasks} labels={Object.fromEntries(data.tasks.map((t) => [t.id, short(planOf(t)?.title ?? '')]))} links={data.conflicts} selectedId={selectedId} onSelect={(t) => setSelectedId(t.id)} tall />
            : <div className="empty">No plans in {data.app.name} yet.</div>}
          {selected && (
            <section className="panel">
              <h2>#{selected.number} {selected.title} <Badge>{planOf(selected)?.title}</Badge></h2>
              <dl className="fields">
                <dt>Status</dt><dd>{selected.status}{selected.heldReason ? ` — ${selected.heldReason}` : ''}</dd>
                <dt>Files</dt><dd>{selected.files.length ? <span className="mono">{selected.files.join(', ')}</span> : <span className="faint">None declared: claims the whole app.</span>}</dd>
                <dt>Shares files with</dt><dd>{data.conflicts.filter((c) => c.includes(selected.id)).map((c) => c.find((x) => x !== selected.id)).map((id) => data.tasks.find((t) => t.id === id)).filter(Boolean).map((t) => `#${t!.number} ${t!.title} (${planOf(t!)?.title})`).join('; ') || <span className="faint">Nothing open.</span>}</dd>
                <dt>Plan</dt><dd><Link to={`/plans/${selected.planId}`}>{planOf(selected)?.title}</Link></dd>
              </dl>
            </section>
          )}
        </>
      )}
    </>
  )
}
