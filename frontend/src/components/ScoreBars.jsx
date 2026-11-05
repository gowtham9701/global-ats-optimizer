import { motion } from 'framer-motion'

const LABELS = {
  keyword_density: 'Keyword Density',
  formatting: 'Formatting',
  quantifiable_metrics: 'Quantifiable Metrics',
  impact_verbs: 'Impact Verbs',
  structure: 'Structure',
}

function barColor(v) {
  if (v >= 80) return 'bg-emerald-500'
  if (v >= 60) return 'bg-amber-500'
  return 'bg-rose-500'
}

export default function ScoreBars({ breakdown }) {
  if (!breakdown) return null
  return (
    <div className="space-y-3">
      {Object.entries(breakdown).map(([key, value], i) => (
        <div key={key}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted font-medium">{LABELS[key] || key}</span>
            <span className="text-faint">{value}/100</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${value}%` }}
              transition={{ duration: 1, delay: i * 0.1, ease: 'easeOut' }}
              className={`h-full rounded-full ${barColor(value)}`}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
