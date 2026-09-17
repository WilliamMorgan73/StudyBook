export interface RadialProgressSegment {
  fraction: number
  color: string
}

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
    .reduce<{ color: string; dash: number; offset: number }[]>((acc, s) => {
      const cumulative = acc.reduce((sum, a) => sum + a.dash, 0)
      const dash = s.fraction * circumference
      return [...acc, { color: s.color, dash, offset: -cumulative }]
    }, [])

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
          strokeDashoffset={arc.offset}
          strokeLinecap="butt"
          style={{ stroke: arc.color }}
        />
      ))}
    </svg>
  )
}
