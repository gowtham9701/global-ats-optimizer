import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import CopilotChat from './components/CopilotChat.jsx'
import Home from './pages/Home.jsx'
import Builder from './pages/Builder.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
      <footer className="py-6 text-center text-sm text-slate-400">
        Global ATS Resume Optimizer & Agentic Architect · Open-source · Zero-cost AI
      </footer>
      {/* Conversational copilot available across the whole app */}
      <CopilotChat />
    </div>
  )
}
