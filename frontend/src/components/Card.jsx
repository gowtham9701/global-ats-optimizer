import { motion } from 'framer-motion'

export default function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-white shadow-md p-5 ${className}`}
    >
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {Icon && <Icon size={18} className="text-brand-600" />}
          <h3 className="font-bold text-slate-800">{title}</h3>
        </div>
      )}
      {children}
    </motion.section>
  )
}
