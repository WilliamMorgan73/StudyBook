import { useEffect, useState } from 'react'

function diffParts(ms: number) {
  const clamped = Math.max(0, ms)
  const days = Math.floor(clamped / 86_400_000)
  const hours = Math.floor((clamped % 86_400_000) / 3_600_000)
  const minutes = Math.floor((clamped % 3_600_000) / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)
  return { days, hours, minutes, seconds }
}

export function Countdown({
  target,
  noneLabel = 'None scheduled',
  arrivedLabel = 'Starting now',
}: {
  target: string | null
  noneLabel?: string
  arrivedLabel?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!target) {
    return <p className="text-base text-muted-foreground">{noneLabel}</p>
  }

  const diff = new Date(target).getTime() - now
  if (diff <= 0) {
    return <p className="text-xl font-semibold">{arrivedLabel}</p>
  }

  const { days, hours, minutes, seconds } = diffParts(diff)

  return (
    <div className="flex items-baseline gap-3 tabular-nums">
      {days > 0 && (
        <span>
          <span className="text-3xl font-semibold">{days}</span>
          <span className="ml-1 text-sm text-muted-foreground">{days === 1 ? 'day' : 'days'}</span>
        </span>
      )}
      <span>
        <span className="text-3xl font-semibold">{String(hours).padStart(2, '0')}</span>
        <span className="ml-1 text-sm text-muted-foreground">hr</span>
      </span>
      <span>
        <span className="text-3xl font-semibold">{String(minutes).padStart(2, '0')}</span>
        <span className="ml-1 text-sm text-muted-foreground">min</span>
      </span>
      {days === 0 && (
        <span>
          <span className="text-3xl font-semibold">{String(seconds).padStart(2, '0')}</span>
          <span className="ml-1 text-sm text-muted-foreground">sec</span>
        </span>
      )}
    </div>
  )
}
