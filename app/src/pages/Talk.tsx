/**
 * Talk: a conversation with the factory's agent, the same Claude Code the planner and builders run, with the
 * engine as its tools. The transcript is rows in the engine; this page refetches on talk.* events. An edit or a
 * command the agent wants to make arrives as a card to allow or deny.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge } from '../components/Badge'
import { API, engine, type App, type TalkMessage, type TalkSession, type Transcript } from '../engine'

export function Talk() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sessions, setSessions] = useState<TalkSession[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [t, setT] = useState<Transcript | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  const reloadList = () => engine.talks().then(setSessions).catch((e) => setError(String(e.message ?? e)))
  useEffect(() => { void reloadList(); engine.apps().then(setApps).catch(() => {}) }, [])
  useEffect(() => {
    if (!id) { setT(null); return }
    let closed = false
    const refresh = () => engine.transcript(id).then((x) => { if (!closed) { setT(x); setError(null) } }).catch((e) => setError(String(e.message ?? e)))
    void refresh()
    const es = new EventSource(`${API}/events?since=-1`)
    const onTalk = (ev: MessageEvent) => {
      const e = JSON.parse(ev.data) as { payload: { sessionId?: string } }
      if (e.payload?.sessionId !== id) return
      window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { void refresh(); void reloadList() }, 120)
    }
    for (const type of ['talk.message', 'talk.permission', 'talk.result']) es.addEventListener(type, onTalk as EventListener)
    es.onerror = () => setError('event stream disconnected; retrying')
    return () => { closed = true; es.close(); window.clearTimeout(timer.current) }
  }, [id])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [t?.messages.length])

  const start = async (appId?: string) => {
    setStarting(true)
    try { const s = await engine.startTalk(appId ? { appId } : {}); await reloadList(); nav(`/talk/${s.id}`) } catch (e: any) { setError(String(e.message ?? e)) } finally { setStarting(false) }
  }
  const send = async () => {
    if (!id || !text.trim()) return
    const body = text; setText('')
    try { await engine.say(id, body) } catch (e: any) { setError(String(e.message ?? e)); setText(body) }
  }
  const busy = t?.session.busy ?? false
  const waiting = t?.messages.filter((m) => m.kind === 'permission' && t.pending.includes(m.payload?.requestId)) ?? []

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
              <Link to={`/talk/${s.id}`} style={{ textDecoration: 'none' }}>{s.title ?? (apps.find((a) => a.id === s.appId)?.name ?? 'The factory')}</Link>
              <div className="faint" style={{ fontSize: 12 }}>{s.lastActiveAt?.slice(5, 16).replace('T', ' ')} {s.busy ? <Badge tone="accent" dot>working</Badge> : s.status === 'ended' ? <Badge>ended</Badge> : null}</div>
            </li>
          ))}
          {!sessions.length && <li className="muted">No conversations yet.</li>}
        </ul>
      </aside>

      <section className="talk-main">
        {!id && <div className="empty">Start a conversation. The agent reads this checkout, has the engine as tools, and asks before it edits or runs anything.</div>}
        {id && !t && !error && <p className="muted">Loading…</p>}
        {error && <div className="empty bad">{error}</div>}
        {t && (
          <>
            <div className="talk-head">
              <div><strong>{t.session.title ?? (apps.find((a) => a.id === t.session.appId)?.name ?? 'The factory')}</strong> <span className="mono faint">{t.session.cwd}</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                {busy && <button className="btn quiet small" onClick={() => engine.interrupt(t.session.id)}>Stop</button>}
                {t.session.status !== 'ended' && <button className="btn quiet small" onClick={() => { if (window.confirm('End this conversation?')) void engine.endTalk(t.session.id).then(reloadList) }}>End</button>}
              </div>
            </div>
            <div className="chat">
              {t.messages.map((m) => <Message key={m.id} m={m} pending={t.pending.includes(m.payload?.requestId)} sessionId={t.session.id} />)}
              {busy && !waiting.length && <div className="msg engine faint"><Badge tone="accent" dot>thinking</Badge></div>}
              <div ref={bottom} />
            </div>
            {t.session.status !== 'ended' && (
              <div className="talk-input">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={waiting.length ? 'Answer the request above first, or type anyway.' : 'Say what you want. Enter sends; Shift+Enter for a new line.'}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
                <button className="btn" disabled={!text.trim()} onClick={send}>Send</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function Message({ m, pending, sessionId }: { m: TalkMessage; pending: boolean; sessionId: string }) {
  const p = m.payload ?? {}
  switch (m.kind) {
    case 'text': return <div className={`msg ${m.author}`}><div className="msg-body">{m.body}</div></div>
    case 'tool_call': return <div className="msg tool mono">{p.tool === 'Bash' ? `$ ${p.input?.command ?? ''}` : `${p.tool} ${p.input?.file ?? p.input?.pattern ?? ''}`}</div>
    case 'tool_result': return <details className="msg tool-result"><summary className="mono faint">{p.ok === false ? 'error' : 'result'}</summary><pre>{m.body}</pre></details>
    case 'permission': return (
      <div className={`perm ${pending ? 'open' : ''}`}>
        <div><strong>{p.tool}</strong> {p.tool === 'Bash' ? <code>{p.input?.command}</code> : <span className="mono">{p.input?.file}</span>}
          {p.tool === 'Edit' && <pre className="diff"><span className="del">- {p.input?.old}</span>{'\n'}<span className="add">+ {p.input?.new}</span></pre>}</div>
        {pending ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn small" onClick={() => engine.permission(sessionId, p.requestId, true)}>Allow</button>
            <button className="btn quiet small" onClick={() => engine.permission(sessionId, p.requestId, true, true)}>Allow {p.tool} for this conversation</button>
            <button className="btn quiet small" onClick={() => engine.permission(sessionId, p.requestId, false)}>Deny</button>
          </div>
        ) : <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>answered</div>}
      </div>
    )
    case 'result': return <div className="msg engine faint mono">{m.body}{p.costUsd != null ? ` · $${Number(p.costUsd).toFixed(2)}` : ''}{p.turns ? ` · ${p.turns} turns` : ''}</div>
    case 'error': return <div className="msg engine bad">{m.body}</div>
    default: return null
  }
}
