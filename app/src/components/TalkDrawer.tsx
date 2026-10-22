/**
 * The agent, on every page: a panel on the right that follows you around, opened with the floating button or ⌘J.
 * The app you are on is the conversation: one per app, found when the panel opens, switching when you switch
 * apps. Every message carries the page you are on, so you can ask it to do whatever, about whatever you see.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Conversation } from './Conversation'
import { engine, type TalkContext } from '../engine'
import { useCurrentApp } from '../current-app'

const KEY = 'if.talk.open'

/** Where the person is, from the route: enough for the agent to look the rest up. */
export function contextFor(pathname: string, search: string): TalkContext {
  const plan = pathname.match(/^\/plans\/(plan_[A-Za-z0-9_-]+)/)?.[1]
  const app = new URLSearchParams(search).get('app') ?? undefined
  if (plan) return { path: pathname, planId: plan, label: 'this plan' }
  if (pathname === '/plans/new') return { path: pathname, label: 'the plan composer' }
  if (pathname.startsWith('/plans')) return { path: pathname, label: 'Build' }
  if (pathname.startsWith('/ideas')) return { path: pathname, label: 'Ideate (the inbox)' }
  if (pathname.startsWith('/learn')) return { path: pathname, label: 'Learn' }
  if (pathname.startsWith('/mockups')) return { path: pathname, label: 'Mockup' }
  if (pathname.startsWith('/graph')) return { path: pathname, appId: app, label: 'the graph' }
  if (pathname.startsWith('/settings')) return { path: pathname, label: 'settings' }
  if (pathname.startsWith('/talk')) return { path: pathname, label: 'the Talk page' }
  return { path: pathname, label: 'Observe' }
}

/** The current app's conversation, started if there is none; "start over" ends it and begins a new one. */
export function useAppTalk() {
  const { app } = useCurrentApp()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let gone = false
    setSessionId(null); setProblem(null)
    if (!app) return
    engine.currentTalk(app.id).then((s) => { if (!gone) setSessionId(s.id) }).catch((e) => { if (!gone) setProblem(String(e.message ?? e)) })
    return () => { gone = true }
  }, [app?.id])
  const startOver = async () => {
    if (!app) return
    if (sessionId) await engine.endTalk(sessionId)
    setSessionId(null)
    const s = await engine.currentTalk(app.id)
    setSessionId(s.id)
  }
  return { app, sessionId, problem, startOver }
}

export function TalkDrawer() {
  const loc = useLocation()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const { app, sessionId, problem, startOver } = useAppTalk()
  const context = useMemo(() => ({ ...contextFor(loc.pathname, loc.search), appId: app?.id }), [loc.pathname, loc.search, app?.id])
  const set = (v: boolean) => { setOpen(v); try { localStorage.setItem(KEY, v ? '1' : '0') } catch { /* fine */ } }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((o) => { try { localStorage.setItem(KEY, o ? '0' : '1') } catch { /* fine */ } return !o }) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { document.body.classList.toggle('talk-open', open); return () => document.body.classList.remove('talk-open') }, [open])

  if (loc.pathname.startsWith('/talk')) return null // the full page is the drawer, there
  if (!open) return <button className="talk-fab" onClick={() => set(true)} title="Talk to the factory (⌘J)" data-component="TalkFab">Talk</button>
  return (
    <aside className="talk-drawer" data-component="TalkDrawer">
      <div className="talk-drawer-head">
        <strong style={{ flex: 1 }}>{app?.name ?? 'The factory'}</strong>
        <button className="btn quiet small" onClick={() => { if (window.confirm(`Start a fresh conversation about ${app?.name ?? 'the factory'}? This one is kept in Talk.`)) void startOver() }} title="End this conversation and begin a new one">Start over</button>
        <Link className="btn quiet small" to="/talk" title="Open in full">Full</Link>
        <button className="btn quiet small" onClick={() => set(false)} title="Close (⌘J)">×</button>
      </div>
      <div className="faint" style={{ fontSize: 12, padding: '0 12px 6px' }}>It knows you're looking at {context.label}.</div>
      {sessionId ? <Conversation sessionId={sessionId} context={context} compact />
        : !app ? <p className="muted" style={{ padding: 12 }}>Pick an app in the nav, or add one in Settings. A conversation belongs to an app.</p>
        : problem ? <div className="empty bad" style={{ margin: 12 }}>{problem}</div>
        : <p className="muted" style={{ padding: 12 }}>Starting…</p>}
    </aside>
  )
}
