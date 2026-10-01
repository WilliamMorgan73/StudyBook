import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'

export interface RadialProgressSegment {
  fraction: number
  color: string
  /** Segments sharing an id highlight together when the ring is interactive. */
  id?: string | number
}

/** Seconds a full ring takes to sweep in; each arc gets its share so the sweep reads as one stroke. */
const SWEEP_DURATION = 0.7
/** How much thicker the highlighted arcs get; the radius leaves room for it so they don't clip. */
const ACTIVE_GROW = 1.3
/** Opacity of the arcs that aren't highlighted while one is. */
const INACTIVE_OPACITY = 0.3

/**
 * Passing `onActiveChange` makes the ring interactive: hovering an arc reports its segment's id,
 * and `activeId` (hovered here or set from outside, e.g. a legend) thickens those arcs and fades
 * the rest.
 */
export function RadialProgress({
  segments,
  size = 40,
  strokeWidth = 4,
  activeId = null,
  onActiveChange,
}: {
  segments: RadialProgressSegment[]
  size?: number
  strokeWidth?: number
  activeId?: string | number | null
  onActiveChange?: (id: string | number | null) => void
}) {
  const interactive = onActiveChange !== undefined
  const center = size / 2
  const radius = center - (interactive ? strokeWidth * ACTIVE_GROW : strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const arcs = segments
    .filter((s) => s.fraction > 0)
    .reduce<
      { id?: string | number; color: string; dash: number; offset: number; start: number; fraction: number }[]
    >((acc, s) => {
      const cumulative = acc.reduce((sum, a) => sum + a.dash, 0)
      const dash = s.fraction * circumference
      return [
        ...acc,
        { id: s.id, color: s.color, dash, offset: -cumulative, start: cumulative / circumference, fraction: s.fraction },
      ]
    }, [])

  const highlight = (id: string | number | undefined) =>
    activeId === null ? { strokeWidth, opacity: 1 } : activeId === id
      ? { strokeWidth: strokeWidth * ACTIVE_GROW, opacity: 1 }
      : { strokeWidth, opacity: INACTIVE_OPACITY }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="-rotate-90"
      onPointerLeave={interactive ? () => onActiveChange(null) : undefined}
    >
      <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
      {arcs.map((arc, i) => (
        <motion.circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          initial={{ strokeDasharray: `0 ${circumference}`, strokeWidth, opacity: 1 }}
          animate={{ strokeDasharray: `${arc.dash} ${circumference - arc.dash}`, ...highlight(arc.id) }}
          transition={{
            strokeDasharray: {
              delay: arc.start * SWEEP_DURATION,
              duration: Math.max(arc.fraction * SWEEP_DURATION, 0.15),
              ease: 'easeOut',
            },
            default: { type: 'spring', stiffness: 500, damping: 35 },
          }}
          strokeDashoffset={arc.offset}
          strokeLinecap="butt"
          className="pointer-events-none"
          style={{ stroke: arc.color }}
        />
      ))}
      {/* Invisible, wider copies of the arcs so thin strokes are easy to point at. */}
      {interactive &&
        arcs.map((arc, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="transparent"
            strokeWidth={strokeWidth * 2}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={arc.offset}
            onPointerEnter={() => onActiveChange(arc.id ?? null)}
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
