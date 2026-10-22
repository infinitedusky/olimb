/**
 * Talk, in full: the conversations on the left, one open on the right. The drawer on every other page is the
 * same conversation, compact; this page is for the long ones.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { Conversation } from '../components/Conversation'
import { engine, type App, type TalkSession } from '../engine'

export function Talk() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sessions, setSessions] = useState<TalkSession[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const reloadList = () => engine.talks().then(setSessions).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => { void reloadList(); engine.apps().then(setApps).catch(() => {}) }, [])

  const start = async (appId?: string) => {
    setStarting(true)
    try { const s = await engine.startTalk(appId ? { appId } : {}); await reloadList(); nav(`/talk/${s.id}`) } catch (e: any) { setError(String(e.message ?? e)) } finally { setStarting(false) }
  }
  const current = sessions.find((s) => s.id === id)
  const name = (s: TalkSession) => s.title ?? (apps.find((a) => a.id === s.appId)?.name ?? 'The factory')

  return (
    <div className="talk" data-component="Talk">
      <aside className="talk-side">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="btn small" disabled={starting} onClick={() => start()}>New · the factory</button>
          {apps.map((a) => <button key={a.id} className="btn quiet small" disabled={starting} onClick={() => start(a.id)}>New · {a.name}</button>)}
        </div>
        <ul className="list" style={{ margin: 0, padding: 0 }}>
          {sessions.map((s) => (
            <li key={s.id} className={s.id === id ? 'active' : ''} style={{ padding: '6px 0' }}>
              <Link to={`/talk/${s.id}`} style={{ textDecoration: 'none' }}>{name(s)}</Link>
              <div className="faint" style={{ fontSize: 12 }}>{s.lastActiveAt?.slice(5, 16).replace('T', ' ')} {s.busy ? <Badge tone="accent" dot>working</Badge> : s.status === 'ended' ? <Badge>ended</Badge> : null}</div>
            </li>
          ))}
          {!sessions.length && <li className="muted">No conversations yet.</li>}
        </ul>
      </aside>

      <section className="talk-main">
        {error && <div className="empty bad">{error}</div>}
        {!id && <div className="empty">Start a conversation, or press ⌘J on any page. The agent reads this checkout, has the engine as tools, and asks before it edits or runs anything.</div>}
        {id && (
          <>
            <div className="talk-head">
              <div><strong>{current ? name(current) : '…'}</strong> <span className="mono faint">{current?.cwd}</span></div>
              {current && current.status !== 'ended' && <button className="btn quiet small" onClick={() => { if (window.confirm('End this conversation?')) void engine.endTalk(id).then(reloadList) }}>End</button>}
            </div>
            <Conversation sessionId={id} context={{ path: `/talk/${id}`, label: 'the Talk page' }} onChanged={reloadList} />
          </>
        )}
      </section>
    </div>
  )
}
