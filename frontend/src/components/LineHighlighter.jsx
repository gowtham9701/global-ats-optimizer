import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

const STYLES = {
  good: { bg: 'bg-success-surface', border: 'border-line', text: 'text-success', Icon: CheckCircle2 },
  warn: { bg: 'bg-warning-surface', border: 'border-line', text: 'text-warning', Icon: AlertTriangle },
  bad: { bg: 'bg-danger-surface', border: 'border-line', text: 'text-danger', Icon: XCircle },
  neutral: { bg: 'bg-card', border: 'border-line', text: 'text-muted', Icon: null },
}

export default function LineHighlighter({ lines = [] }) {
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const s = STYLES[line.verdict] || STYLES.neutral
        const Icon = s.Icon
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.6) }}
            className={`rounded-lg border-l-4 ${s.border} ${s.bg} px-3 py-2`}
          >
            <div className="flex items-start gap-2">
              {Icon && <Icon size={16} className={`${s.text} mt-0.5 shrink-0`} />}
              <p className="text-sm text-ink leading-snug">{line.text}</p>
            </div>
            {line.reason && <p className={`text-xs mt-1 ${s.text}`}>{line.reason}</p>}
            {line.suggestion && (
              <p className="text-xs mt-1 text-muted italic">↳ {line.suggestion}</p>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
