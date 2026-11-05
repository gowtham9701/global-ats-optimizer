import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Loader2, Gauge } from 'lucide-react'
import { analyzeResume } from '../api/client.js'

function tone(score) {
  if (score >= 80) return { ring: 'text-emerald-500', bg: 'bg-emerald-50', txt: 'text-emerald-600', label: 'ATS Ready' }
  if (score >= 60) return { ring: 'text-amber-500', bg: 'bg-amber-50', txt: 'text-amber-600', label: 'Needs Work' }
  return { ring: 'text-rose-500', bg: 'bg-rose-50', txt: 'text-rose-600', label: 'At Risk' }
}

// Compact, reusable ATS verification control. Pass a getText() that returns the
// latest resume text so it always scores the current (possibly edited) content.
export default function AtsScore({ getText, jobDescription = '', targetCountry = 'global', template = '', wordCount = 0, onResult, compact = false }) {
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const verify = async () => {
    const text = (getText?.() || '').trim()
    if (!text) {
      setError('Add some resume content first.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await analyzeResume({ resumeText: text, jobDescription, targetCountry, template, wordCount: wordCount || text.split(/\s+/).filter(Boolean).length })
      setScore(data.total_score)
      onResult?.(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const t = score != null ? tone(score) : null

  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'flex-wrap'}`}>
      <button
        onClick={verify}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-line-input text-ink text-sm font-semibold hover:border-brand-400 transition"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} className="text-brand-600" />}
        Verify ATS Score
      </button>

      <AnimatePresence>
        {score != null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${t.bg}`}
          >
            <Gauge size={15} className={t.txt} />
            <span className={`font-extrabold ${t.txt}`}>{score}</span>
            <span className="text-xs text-faint">/100</span>
            <span className={`text-xs font-semibold ${t.txt}`}>· {t.label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <span className="text-xs text-rose-500">{error}</span>}
    </div>
  )
}
