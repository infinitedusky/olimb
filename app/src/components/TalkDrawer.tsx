/**
 * The agent, on every page: a panel on the right that follows you around, opened with the floating button or ⌘J.
 * It keeps one conversation going (the id lives in localStorage, a per-viewer convenience) and tells the agent
 * which page you are on with every message, so you can ask it to do whatever, about whatever you are looking at.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Conversation } from './Conversation'
import { engine, type TalkContext, type TalkSession } from '../engine'
import { useCurrentApp } from '../current-app'

const KEY = 'if.talk'

function read(): { open: boolean; sessionId: string | null } {
  try { return { open: false, sessionId: null, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { open: false, sessionId: null } }
}
function write(v: { open: boolean; sessionId: string | null }) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private window, blocked storage: fine */ } }

/** Where the person is, from the route: enough for the agent to look the rest up. */
function contextFor(pathname: string, search: string): TalkContext {
  const plan = pathname.match(/^\/plans\/(plan_[A-Za-z0-9_-]+)/)?.[1]
  const talk = pathname.match(/^\/talk\/(sess_[A-Za-z0-9_-]+)/)?.[1]
  const app = new URLSearchParams(search).get('app') ?? undefined
  if (plan) return { path: pathname, planId: plan, label: 'this plan' }
  if (pathname === '/plans/new') return { path: pathname, label: 'the plan composer' }
  if (pathname.startsWith('/plans')) return { path: pathname, label: 'the plans list' }
  if (pathname.startsWith('/ideas')) return { path: pathname, label: 'the ideas inbox' }
  if (pathname.startsWith('/graph')) return { path: pathname, appId: app, label: 'the graph' }
  if (pathname.startsWith('/settings')) return { path: pathname, label: 'settings' }
  if (talk) return { path: pathname, label: 'the Talk page' }
  return { path: pathname, label: 'the Now page' }
}

export function TalkDrawer() {
  const loc = useLocation()
  const { app } = useCurrentApp()
  const [state, setState] = useState(read)
  const [sessions, setSessions] = useState<TalkSession[]>([])
  const [starting, setStarting] = useState(false)
  const context = useMemo(() => ({ ...contextFor(loc.pathname, loc.search), appId: app?.id }), [loc.pathname, loc.search, app?.id])
  const set = (patch: Partial<typeof state>) => setState((s) => { const v = { ...s, ...patch }; write(v); return v })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); set({ open: !read().open }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { document.body.classList.toggle('talk-open', state.open); return () => document.body.classList.remove('talk-open') }, [state.open])
  useEffect(() => { if (state.open) engine.talks().then(setSessions).catch(() => {}) }, [state.open])

  const fresh = async () => {
    setStarting(true)
    try { const s = await engine.startTalk({ appId: app?.id, title: app ? `Alongside · ${app.name}` : 'Alongside' }); set({ sessionId: s.id }); setSessions(await engine.talks()) } finally { setStarting(false) }
  }
  useEffect(() => { // first open: pick up the latest open conversation, or start one
    if (!state.open || state.sessionId || starting) return
    engine.talks().then((all) => { const open = all.find((s) => s.status !== 'ended' && s.appId === app?.id) ?? all.find((s) => s.status !== 'ended'); if (open) set({ sessionId: open.id }); else void fresh() }).catch(() => {})
  }, [state.open, state.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loc.pathname.startsWith('/talk')) return null // the full page is the drawer, there
  if (!state.open) return <button className="talk-fab" onClick={() => set({ open: true })} title="Talk to the factory (⌘J)" data-component="TalkFab">Talk</button>
  const current = sessions.find((s) => s.id === state.sessionId)
  return (
    <aside className="talk-drawer" data-component="TalkDrawer">
      <div className="talk-drawer-head">
        <select value={state.sessionId ?? ''} onChange={(e) => set({ sessionId: e.target.value || null })} title="Which conversation">
          {sessions.filter((s) => s.status !== 'ended' || s.id === state.sessionId).map((s) => <option key={s.id} value={s.id}>{s.title ?? 'The factory'} · {s.lastActiveAt?.slice(5, 16).replace('T', ' ')}</option>)}
        </select>
        <button className="btn quiet small" disabled={starting} onClick={fresh} title="Start a new conversation">New</button>
        {state.sessionId && <Link className="btn quiet small" to={`/talk/${state.sessionId}`} title="Open in full">Full</Link>}
        <button className="btn quiet small" onClick={() => set({ open: false })} title="Close (⌘J)">×</button>
      </div>
      <div className="faint" style={{ fontSize: 12, padding: '0 12px 6px' }}>It knows you're looking at {context.label}.{current?.busy ? ' Working…' : ''}</div>
      {state.sessionId ? <Conversation sessionId={state.sessionId} context={context} compact onChanged={() => { /* keep */ }} /> : <p className="muted" style={{ padding: 12 }}>Starting…</p>}
    </aside>
  )
}
