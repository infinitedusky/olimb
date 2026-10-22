import { Link, NavLink, useLocation } from 'react-router'
import { useCurrentApp } from '../current-app'
import { TalkDrawer } from './TalkDrawer'

/** The nav is the loop: one step per line, its icon in front. The wordmark sits above; the emoji row is the logo outside the site. */
const STEPS: { to: string; icon: string; label: string; also?: RegExp; sub?: { to: string; label: string }[] }[] = [
  { to: '/', icon: '🔭', label: 'Observe' },
  { to: '/learn', icon: '🧠', label: 'Learn' },
  { to: '/ideas', icon: '💡', label: 'Ideate' },
  { to: '/mockups', icon: '✏️', label: 'Mockup' },
  { to: '/plans', icon: '🔨', label: 'Build', also: /^\/(plans|graph)/, sub: [{ to: '/graph', label: 'Graph' }] },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const { apps, app, setAppId } = useCurrentApp()
  const { pathname } = useLocation()
  const cls = (active: boolean) => `link ${active ? 'active' : ''}`
  return (
    <div className="shell" data-component="Shell">
      <TalkDrawer />
      <nav className="nav">
        <Link to="/" className="brand" title="Olimb: observe, learn, ideate, mockup, build" aria-label="Olimb">
          O<i>.</i>L<i>.</i>I<i>.</i>M<i>.</i>B
        </Link>
        {STEPS.map((s) => (
          <div key={s.to}>
            <NavLink to={s.to} end={s.to === '/'} className={({ isActive }) => cls(isActive || !!s.also?.test(pathname))}>
              <span className="ico" aria-hidden="true">{s.icon}</span>{s.label}
            </NavLink>
            {s.sub?.map((x) => <NavLink key={x.to} to={x.to} className={({ isActive }) => `link sub ${isActive ? 'active' : ''}`}>{x.label}</NavLink>)}
          </div>
        ))}
        <div className="nav-rule" />
        <NavLink to="/talk" className={({ isActive }) => cls(isActive)}><span className="ico" aria-hidden="true">💬</span>Talk</NavLink>
        <NavLink to="/settings" className={({ isActive }) => cls(isActive)}><span className="ico" aria-hidden="true">⚙️</span>Settings</NavLink>
        <div className="apps">
          <div className="mono faint" style={{ margin: '0 10px 6px' }}>APP</div>
          {apps.map((a) => (
            <button key={a.id} className={`link app-pick ${a.id === app?.id ? 'active' : ''}`} onClick={() => setAppId(a.id)} title={a.id === app?.id ? 'The app you are working on' : `Work on ${a.name}`}>{a.name}</button>
          ))}
          {!apps.length && <div className="faint" style={{ margin: '0 10px', fontSize: 13 }}>None yet: add one in Settings.</div>}
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
