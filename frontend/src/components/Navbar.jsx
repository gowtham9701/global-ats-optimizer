import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, LayoutDashboard, Sparkles, Wand2 } from 'lucide-react'

export default function Navbar() {
  const { pathname } = useLocation()
  const link = (to, label, Icon) => {
    const active = pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition
          ${active ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        <Icon size={16} /> {label}
      </Link>
    )
  }
  return (
    <header className="sticky top-0 z-40 glass">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <motion.div
            initial={{ rotate: -20, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white"
          >
            <Sparkles size={18} />
          </motion.div>
          <div className="leading-tight">
            <div className="font-extrabold text-slate-800">ATS Architect</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Global Optimizer</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {link('/', 'Home', FileText)}
          {link('/builder', 'Create', Wand2)}
          {link('/dashboard', 'Dashboard', LayoutDashboard)}
        </nav>
      </div>
    </header>
  )
}
