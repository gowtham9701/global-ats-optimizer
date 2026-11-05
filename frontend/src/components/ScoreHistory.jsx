import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Database, Loader2 } from 'lucide-react'
import { fetchHistory } from '../api/client.js'

function barColor(score) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-rose-500'
}

// Renders the persisted ATS score history (from Neon) as a trend of bars.
export default function ScoreHistory({ refreshKey = 0 }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchHistory(20)
      .then((d) => { if (active) setData(d) })
      .catch(() => { if (active) setData({ enabled: false, events: [] }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refreshKey])

  if (loading) {
    return <div className="py-8 grid place-items-center text-faint"><Loader2 size={20} className="animate-spin" /></div>
  }

  if (!data?.enabled) {
    return (
      <div className="text-sm text-faint flex items-center gap-2 py-3">
        <Database size={15} /> History persistence is off (no database configured).
      </div>
    )
  }

  const events = data.events || []
  if (events.length === 0) {
    return (
      <div className="text-sm text-faint flex items-center gap-2 py-3">
        <TrendingUp size={15} /> No history yet — verify your ATS score to start tracking progress.
      </div>
    )
  }

  const latest = events[events.length - 1]?.total_score ?? 0
  const first = events[0]?.total_score ?? 0
  const delta = latest - first

  return (
    <div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-3xl font-extrabold text-ink">{latest}<span className="text-base text-faint">/100</span></div>
          <div className="text-xs text-muted">Latest ATS score</div>
        </div>
        {events.length > 1 && (
          <div className={`text-sm font-semibold ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} pts since first check
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5 h-28">
        {events.map((e, i) => (
          <motion.div
            key={e.id || i}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(e.total_score, 3)}%` }}
            transition={{ delay: i * 0.03 }}
            title={`${e.total_score}/100 · ${e.target_country} · ${new Date(e.created_at).toLocaleString()}`}
            className={`flex-1 min-w-[6px] rounded-t ${barColor(e.total_score)} hover:opacity-80`}
          />
        ))}
      </div>
      <div className="mt-2 text-[11px] text-faint flex justify-between">
        <span>{new Date(events[0].created_at).toLocaleDateString()}</span>
        <span>{events.length} checks</span>
        <span>{new Date(latest && events[events.length - 1].created_at).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
