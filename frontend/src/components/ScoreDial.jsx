import { motion, useMotionValue, animate } from 'framer-motion'
import { useEffect, useState } from 'react'

function colorFor(score) {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

export default function ScoreDial({ score = 0, size = 180, label = 'ATS Score' }) {
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const [display, setDisplay] = useState(0)
  const mv = useMotionValue(0)

  useEffect(() => {
    const controls = animate(mv, score, {
      duration: 1.4,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return controls.stop
  }, [score])

  const color = colorFor(display)
  const offset = circumference - (display / 100) * circumference

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth="14" fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <motion.span
          key={display}
          className="text-5xl font-extrabold"
          style={{ color }}
        >
          {display}
        </motion.span>
        <span className="text-xs uppercase tracking-widest text-faint">{label}</span>
      </div>
    </div>
  )
}
