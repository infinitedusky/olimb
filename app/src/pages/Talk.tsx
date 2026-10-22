/**
 * Talk, in full: the current app's conversation, the same one the drawer carries around, with room to read.
 * Earlier conversations about this app are listed below, read-only.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { Conversation } from '../components/Conversation'
import { useAppTalk } from '../components/TalkDrawer'
import { engine, type TalkSession } from '../engine'

export function Talk() {
  const { id } = useParams() // an earlier conversation, read-only; without it, the app's current one
  const { app, sessionId, startOver } = useAppTalk()
  const [sessions, setSessions] = useState<TalkSession[]>([])
  const reload = () => engine.talks().then(setSessions).catch(() => {})
  useEffect(() => { void reload() }, [sessionId])
  const shown = id ?? sessionId
  const earlier = sessions.filter((s) => s.id !== sessionId && s.appId === (app?.id ?? null) && (s.messages ?? 0) > 0)
  const current = sessions.find((s) => s.id === shown)

  return (
    <div className="talk" data-component="Talk">
      <aside className="talk-side">
        <div style={{ marginBottom: 10 }}><strong>{app?.name ?? 'The factory'}</strong><div className="faint" style={{ fontSize: 12 }}>One conversation per app. Pick another app in the nav to talk about it.</div></div>
        {id && <p><Link className="btn quiet small" to="/talk">← Back to the current one</Link></p>}
        <button className="btn quiet small" onClick={() => { if (window.confirm(`Start a fresh conversation about ${app?.name ?? 'the factory'}? This one stays here as an earlier one.`)) void startOver() }}>Start over</button>
        {earlier.length > 0 && (
          <>
            <div className="mono faint" style={{ margin: '14px 0 6px' }}>EARLIER</div>
            <ul className="list" style={{ margin: 0, padding: 0 }}>
              {earlier.map((s) => (
                <li key={s.id} className={s.id === id ? 'active' : ''} style={{ padding: '6px 0' }}>
                  <Link to={`/talk/${s.id}`} style={{ textDecoration: 'none' }}>{s.lastActiveAt?.slice(0, 16).replace('T', ' ')}</Link>
                  <div className="faint" style={{ fontSize: 12 }}>{s.messages} messages {s.status === 'ended' ? <Badge>ended</Badge> : null}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <section className="talk-main">
        <div className="talk-head">
          <div><strong>{app?.name ?? 'The factory'}</strong> <span className="mono faint">{current?.cwd}</span></div>
          {id && <Badge>earlier conversation</Badge>}
        </div>
        {shown ? <Conversation sessionId={shown} context={{ path: '/talk', appId: app?.id, label: 'the Talk page' }} onChanged={reload} /> : <p className="muted">Starting…</p>}
      </section>
    </div>
  )
}
