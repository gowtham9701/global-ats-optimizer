import { motion, useMotionValue, animate } from 'framer-motion'
import { useEffect, useState } from 'react'

function colorFor(score) {
  if (score >= 80) return '#2f6b4a'
  if (score >= 60) return '#b89b4a'
  return '#b06a56'
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
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--line-strong)" strokeWidth="12" fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <motion.span
          key={display}
          className="font-serif text-[46px] leading-none"
          style={{ color }}
        >
          {display}
        </motion.span>
        <span className="text-[11px] uppercase tracking-[0.12em] text-faint mt-1">{label}</span>
      </div>
    </div>
  )
}
