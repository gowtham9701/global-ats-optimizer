import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe2, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { checkFormat } from '../api/client.js'

const STATUS = {
  pass: { icon: CheckCircle2, cls: 'text-success', bg: 'bg-success-surface' },
  warn: { icon: AlertTriangle, cls: 'text-warning', bg: 'bg-warning-surface' },
  fail: { icon: XCircle, cls: 'text-danger', bg: 'bg-danger-surface' },
}

function tone(score) {
  if (score >= 80) return 'text-success'
  if (score >= 55) return 'text-warning'
  return 'text-danger'
}

// Reusable country-format verification. Works for generated AND uploaded resumes.
export default function FormatCheck({ getText, targetCountry = 'global', compact = false }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const verify = async () => {
    const text = (getText?.() || '').trim()
    if (!text) { setError('Add some resume content first.'); return }
    setError(''); setLoading(true)
    try {
      const data = await checkFormat({ resumeText: text, targetCountry })
      setResult(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Format check failed.')
    } finally {
      setLoading(false)
    }
  }

  const label = targetCountry.charAt(0).toUpperCase() + targetCountry.slice(1)

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={verify}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-card border border-line-input text-ink text-field font-medium hover:bg-[var(--hover)] transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Globe2 size={16} className="text-muted" />}
          Verify {label} format
        </button>
        {result && (
          <span className={`text-sm font-bold ${tone(result.compliance_score)}`}>
            {result.compliance_score}/100 compliant
          </span>
        )}
        {error && <span className="text-xs text-rose-500">{error}</span>}
      </div>

      <AnimatePresence>
        {result && !compact && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2"
          >
            {result.rules.map((r, i) => {
              const s = STATUS[r.status] || STATUS.warn
              const Icon = s.icon
              return (
                <div key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 ${s.bg}`}>
                  <Icon size={16} className={`${s.cls} mt-0.5 shrink-0`} />
                  <div>
                    <div className={`text-sm font-semibold ${s.cls}`}>{r.label}</div>
                    <div className="text-xs text-muted">{r.detail}</div>
                  </div>
                </div>
              )
            })}
            {result.note && (
              <div className="text-xs text-muted bg-surface rounded-lg px-3 py-2">{result.note}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
