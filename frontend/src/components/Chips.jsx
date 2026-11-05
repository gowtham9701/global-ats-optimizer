import { motion } from 'framer-motion'

export default function Chips({ items = [], tone = 'green' }) {
  const styles = {
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-rose-100 text-rose-700',
    blue: 'bg-brand-100 text-brand-700',
  }
  if (!items.length) return <p className="text-sm text-faint">None</p>
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <motion.span
          key={item + i}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[tone]}`}
        >
          {item}
        </motion.span>
      ))}
    </div>
  )
}
