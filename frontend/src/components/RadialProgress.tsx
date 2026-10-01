import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'

export interface RadialProgressSegment {
  fraction: number
  color: string
}

/** Seconds a full ring takes to sweep in; each arc gets its share so the sweep reads as one stroke. */
const SWEEP_DURATION = 0.7

export function RadialProgress({
  segments,
  size = 40,
  strokeWidth = 4,
}: {
  segments: RadialProgressSegment[]
  size?: number
  strokeWidth?: number
}) {
  const center = size / 2
  const radius = center - strokeWidth / 2
  const circumference = 2 * Math.PI * radius

  const arcs = segments
    .filter((s) => s.fraction > 0)
    .reduce<{ color: string; dash: number; offset: number; start: number; fraction: number }[]>((acc, s) => {
      const cumulative = acc.reduce((sum, a) => sum + a.dash, 0)
      const dash = s.fraction * circumference
      return [
        ...acc,
        { color: s.color, dash, offset: -cumulative, start: cumulative / circumference, fraction: s.fraction },
      ]
    }, [])

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
      {arcs.map((arc, i) => (
        <motion.circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${arc.dash} ${circumference - arc.dash}` }}
          transition={{
            delay: arc.start * SWEEP_DURATION,
            duration: Math.max(arc.fraction * SWEEP_DURATION, 0.15),
            ease: 'easeOut',
          }}
          strokeDashoffset={arc.offset}
          strokeLinecap="butt"
          style={{ stroke: arc.color }}
        />
      ))}
    </svg>
  )
}

/** A number that counts up from 0 on mount, and tweens to new values after that. */
export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const count = useMotionValue(0)
  const display = useTransform(count, (v) => v.toFixed(decimals))

  useEffect(() => {
    const controls = animate(count, value, { duration: SWEEP_DURATION, ease: 'easeOut' })
    return () => controls.stop()
  }, [count, value])

  return <motion.span>{display}</motion.span>
}
