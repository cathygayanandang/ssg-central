import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'bi-speedometer2', end: true },
  { to: '/officers', label: 'Officers', icon: 'bi-people' },
  { to: '/students', label: 'Students', icon: 'bi-mortarboard' },
  { to: '/events', label: 'Events', icon: 'bi-calendar-event' },
  { to: '/attendance', label: 'Attendance', icon: 'bi-qr-code-scan' },
  { to: '/student-attendance', label: 'Student Attendance', icon: 'bi-clipboard-check' },
  { to: '/fines', label: 'Fines & Payments', icon: 'bi-cash-coin' },
  { to: '/fine-settings', label: 'Fine Settings', icon: 'bi-sliders', adminOnly: true },
  { to: '/audit-logs', label: 'Audit Logs', icon: 'bi-clock-history', adminOnly: true },
]

// Ordered longest-prefix-first so nested routes (e.g. /students/bulk-import)
// resolve to their own title instead of falling back to the parent's.
const TITLES = [
  ['/students/bulk-import', 'Bulk Import Students'],
  ['/students', 'Students Directory'],
  ['/officers', 'Officers'],
  ['/events', 'Events'],
  ['/attendance', 'Attendance'],
  ['/student-attendance', 'Student Attendance'],
  ['/fines', 'Fines & Payments'],
  ['/fine-settings', 'Fine Settings'],
  ['/audit-logs', 'Audit Logs'],
  ['/', 'Dashboard'],
]

function resolveTitle(pathname) {
  const match = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))
  return match ? match[1] : 'SSG Central'
}

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const title = resolveTitle(location.pathname)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-title">SSG Central</div>
          <div className="brand-sub">SMIT Supreme Student Body</div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setNavOpen(false)}
            >
              <i className={`bi ${item.icon}`}></i>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="mb-2">{profile?.full_name || 'Signed in'}</div>
          <button className="btn btn-sm btn-outline-light w-100" onClick={handleSignOut}>
            <i className="bi bi-box-arrow-right me-1"></i> Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-sm btn-outline-navy d-md-none"
              onClick={() => setNavOpen((v) => !v)}
            >
              <i className="bi bi-list"></i>
            </button>
            <h1>{title}</h1>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge-status badge-active">
              {profile?.position || profile?.type || 'Officer'}
            </span>
          </div>
        </header>
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
