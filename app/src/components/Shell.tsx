import { Link, NavLink } from 'react-router'

export function Shell({ apps, children }: { apps: string[]; children: React.ReactNode }) {
  return (
    <div className="shell" data-component="Shell">
      <nav className="nav">
        <Link to="/" className="brand">Idea Factory</Link>
        <NavLink to="/" end className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Now</NavLink>
        <NavLink to="/ideas" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Ideas</NavLink>
        <NavLink to="/graph" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Graph</NavLink>
        <NavLink to="/plans" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Plans</NavLink>
        <NavLink to="/settings" className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>Settings</NavLink>
        <div className="apps">
          <div className="mono faint" style={{ margin: '0 10px 6px' }}>APPS</div>
          {apps.map((a) => <div key={a} className="link">{a}</div>)}
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
