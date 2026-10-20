import type { Module, Status } from '../providers'
import { Badge, type Tone } from '../components/Badge'

const TONE: Record<Status, Tone> = { connected: 'ok', pending: 'warn', 'not connected': 'neutral' }

/** Modules and the providers that fill them. Telemetry first: it's what feeds the factory. */
export function Settings({ modules }: { modules: Module[] }) {
  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      {modules.map((m) => (
        <section className="panel" key={m.role}>
          <h2>{m.role}</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>{m.why}</p>
          <div className="providers">
            {m.providers.map((p) => (
              <div className="provider" key={p.name}>
                <div><strong>{p.name}</strong> <span className="muted">— {p.does}</span>
                  {p.note && <div className="faint" style={{ fontSize: 13 }}>{p.note}</div>}</div>
                <Badge tone={TONE[p.status]} dot>{p.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
