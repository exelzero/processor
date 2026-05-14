/**
 * Root layout for all authenticated pages.
 *
 * Renders a fixed left sidebar with brand identity and navigation links,
 * and a scrollable main content area where child routes are mounted via
 * React Router's <Outlet>. Adding a new top-level page only requires
 * adding an entry to the `nav` array and a corresponding <Route> in App.jsx.
 */
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, CalendarDays, Sparkles, BarChart2, ShoppingBag, LogOut } from 'lucide-react'

const nav = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/patients',    icon: Users,            label: 'Patients' },
  { to: '/appointments',icon: CalendarDays,     label: 'Appointments' },
  { to: '/services',    icon: Sparkles,         label: 'Services' },
  { to: '/analytics',   icon: BarChart2,        label: 'Analytics' },
  { to: '/sales',       icon: ShoppingBag,      label: 'Sales' },
]

export default function Layout() {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="h-screen bg-stone-50 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-stone-200 flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-stone-100">
          <h1 className="text-lg font-light tracking-widest text-stone-800 uppercase">Processor</h1>
          <p className="text-stone-400 text-xs tracking-wide mt-0.5">OK Beauty Space</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-stone-100 text-stone-900 font-medium'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-stone-100">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-stone-400 hover:text-stone-800 hover:bg-stone-50 transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content — overflow-auto so pages without a DataTable (Dashboard,
          Analytics, etc.) still scroll normally.  Pages that use DataTable
          override this by making themselves h-full flex flex-col, which lets
          DataTable fill the remaining space and scroll internally. */}
      <main className="flex-1 overflow-auto flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
