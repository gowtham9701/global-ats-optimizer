import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export default function SplitScreen({ leftTitle, rightTitle, left, right }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-2xl bg-white shadow-md overflow-hidden"
      >
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <span className="font-semibold text-slate-600 text-sm">{leftTitle}</span>
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Original</span>
        </div>
        <pre className="thin-scroll p-4 text-sm text-slate-600 whitespace-pre-wrap max-h-[520px] overflow-auto font-sans">
          {left}
        </pre>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-2xl bg-white shadow-md overflow-hidden ring-2 ring-brand-500/30"
      >
        <div className="px-4 py-3 border-b bg-brand-50 flex items-center justify-between">
          <span className="font-semibold text-brand-700 text-sm flex items-center gap-1">
            <ArrowRight size={14} /> {rightTitle}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-brand-400">Enhanced</span>
        </div>
        <div className="thin-scroll p-4 max-h-[520px] overflow-auto">{right}</div>
      </motion.div>
    </div>
  )
}
