import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, User, KanbanSquare, FilePlus2, FileText,
  Moon, Sun, Github,
} from 'lucide-react'
import { BRAND } from '../config/brand.js'
import { useTheme } from '../store/ThemeContext.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/applications', label: 'Applications', icon: KanbanSquare },
  { to: '/new', label: 'New application', icon: FilePlus2 },
  { to: '/resume', label: 'Resume studio', icon: FileText },
]

export default function AppShell({ children }) {
  const { pathname } = useLocation()
  const { theme, toggle } = useTheme()

  const isActive = (to) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

  const navItem = (to, label, Icon, active) => (
    <Link
      key={to}
      to={to}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-control text-field transition-colors
        ${active
          ? 'bg-primary text-on-primary'
          : 'text-muted hover:text-ink hover:bg-[var(--hover)]'}`}
    >
      <Icon size={17} strokeWidth={1.75} /> {label}
    </Link>
  )

  return (
    <div className="min-h-screen flex bg-paper text-ink">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-surface border-r border-line">
        <Link to="/" className="flex items-center gap-2.5 px-5 h-[72px] border-b border-line">
          <Mark />
          <div className="leading-tight">
            <div className="title-md text-[19px]">{BRAND.name}</div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-faint">Career Suite</div>
          </div>
        </Link>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ to, label, icon }) => navItem(to, label, icon, isActive(to)))}
        </nav>

        <div className="p-3 border-t border-line space-y-0.5">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-field text-muted hover:text-ink hover:bg-[var(--hover)] transition-colors"
          >
            {theme === 'dark' ? <Sun size={17} strokeWidth={1.75} /> : <Moon size={17} strokeWidth={1.75} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <a
            href="https://github.com/gowtham9701/global-ats-optimizer"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-control text-field text-muted hover:text-ink hover:bg-[var(--hover)] transition-colors"
          >
            <Github size={17} strokeWidth={1.75} /> Source
          </a>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 glass h-14 flex items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <Mark small />
            <span className="title-md text-[17px]">{BRAND.name}</span>
          </Link>
          <button onClick={toggle} className="p-2 rounded-control hover:bg-[var(--hover)] text-muted">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line flex justify-around py-1.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = isActive(to)
            return (
              <Link key={to} to={to} className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${active ? 'text-ink' : 'text-faint'}`}>
                <Icon size={18} strokeWidth={1.75} /> {label.split(' ')[0]}
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>
    </div>
  )
}

function Mark({ small }) {
  const s = small ? 'w-7 h-7 text-[13px]' : 'w-9 h-9 text-[15px]'
  return (
    <div className={`${s} rounded-control bg-primary text-on-primary grid place-items-center font-serif font-medium`}>
      Cf
    </div>
  )
}
