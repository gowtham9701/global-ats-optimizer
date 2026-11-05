import { motion } from 'framer-motion'
import { Check, Cpu, Crown, GraduationCap } from 'lucide-react'

const ICONS = {
  tech_minimalist: Cpu,
  executive: Crown,
  academic: GraduationCap,
}

const GRADIENTS = {
  tech_minimalist: 'from-sky-500 to-blue-700',
  executive: 'from-amber-500 to-orange-700',
  academic: 'from-emerald-500 to-teal-700',
}

export default function TemplateGrid({ templates, selected, onSelect }) {
  return (
    <div className="grid sm:grid-cols-3 gap-5">
      {templates.map((t, i) => {
        const Icon = ICONS[t.id] || Cpu
        const active = selected === t.id
        return (
          <motion.button
            key={t.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -6 }}
            onClick={() => onSelect(t.id)}
            className={`relative text-left rounded-card p-5 border-2 transition bg-card
              ${active ? 'border-brand-600 shadow-xl shadow-brand-600/20' : 'border-transparent shadow-md hover:shadow-lg'}`}
          >
            {active && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-3 right-3 w-6 h-6 rounded-full bg-brand-600 grid place-items-center text-white"
              >
                <Check size={14} />
              </motion.div>
            )}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${GRADIENTS[t.id] || GRADIENTS.tech_minimalist} grid place-items-center text-white mb-4`}>
              <Icon size={22} />
            </div>
            <h3 className="font-bold text-ink">{t.name}</h3>
            <p className="text-sm text-muted mt-1">{t.description}</p>
          </motion.button>
        )
      })}
    </div>
  )
}
