import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Loader2, Gauge } from 'lucide-react'
import { analyzeResume } from '../api/client.js'

function tone(score) {
  if (score >= 80) return { bg: 'bg-success-surface', txt: 'text-success', label: 'ATS Ready' }
  if (score >= 60) return { bg: 'bg-warning-surface', txt: 'text-warning', label: 'Needs Work' }
  return { bg: 'bg-danger-surface', txt: 'text-danger', label: 'At Risk' }
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
        className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-card border border-line-input text-ink text-field font-medium hover:bg-[var(--hover)] transition-colors"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} className="text-muted" />}
        Verify ATS Score
      </button>

      <AnimatePresence>
        {score != null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-control ${t.bg}`}
          >
            <Gauge size={15} className={t.txt} />
            <span className={`font-serif text-[17px] ${t.txt}`}>{score}</span>
            <span className="text-xs text-faint">/100</span>
            <span className={`text-xs font-medium ${t.txt}`}>· {t.label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
