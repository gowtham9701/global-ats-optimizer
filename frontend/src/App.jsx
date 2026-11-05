import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import CopilotChat from './components/CopilotChat.jsx'
import DashboardHome from './pages/DashboardHome.jsx'
import Profile from './pages/Profile.jsx'
import Applications from './pages/Applications.jsx'
import NewApplication from './pages/NewApplication.jsx'
import Builder from './pages/Builder.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { BRAND } from './config/brand.js'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/new" element={<NewApplication />} />
        <Route path="/resume" element={<Builder />} />
        <Route path="/analysis" element={<Dashboard />} />
        {/* Back-compat redirects from the previous ATS-only app */}
        <Route path="/builder" element={<Navigate to="/resume" replace />} />
        <Route path="/dashboard" element={<Navigate to="/analysis" replace />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="py-6 text-center text-xs text-ink-400">
        {BRAND.name} · {BRAND.tagline} · self-hosted, your data on your server
      </footer>
      <CopilotChat />
    </AppShell>
  )
}
