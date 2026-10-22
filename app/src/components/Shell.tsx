import { Link, NavLink } from 'react-router'
import { useCurrentApp } from '../current-app'
import { TalkDrawer } from './TalkDrawer'

export function Shell({ children }: { children: React.ReactNode }) {
  const { apps, app, setAppId } = useCurrentApp()
  return (
    <div className="shell" data-component="Shell">
      <TalkDrawer />
      <nav className="nav">
        <Link to="/" className="brand">Idea Factory</Link>
        <NavLink to="/" end className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Now</NavLink>
        <NavLink to="/talk" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Talk</NavLink>
        <NavLink to="/ideas" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Ideas</NavLink>
        <NavLink to="/graph" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Graph</NavLink>
        <NavLink to="/plans" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Plans</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Settings</NavLink>
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
