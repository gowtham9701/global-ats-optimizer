import { motion } from 'framer-motion'

export default function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-panel bg-card border border-line shadow-raised p-5 ${className}`}
    >
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {Icon && <Icon size={17} strokeWidth={1.75} className="text-muted" />}
          <h3 className="title-md text-[18px]">{title}</h3>
        </div>
      )}
      {children}
    </motion.section>
  )
}
