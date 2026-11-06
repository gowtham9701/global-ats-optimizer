import { motion } from 'framer-motion'

export default function Chips({ items = [], tone = 'green' }) {
  const styles = {
    green: 'bg-success-surface text-success',
    red: 'bg-danger-surface text-danger',
    blue: 'bg-[var(--selected)] text-ink',
  }
  if (!items.length) return <p className="text-meta text-faint">None</p>
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <motion.span
          key={item + i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.03 }}
          className={`px-2.5 py-1 rounded-full text-control font-medium ${styles[tone]}`}
        >
          {item}
        </motion.span>
      ))}
    </div>
  )
}
