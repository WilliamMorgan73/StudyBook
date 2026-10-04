import { motion } from 'motion/react'

import { MATURITY_STEPS, maturityColor, type Maturity } from '@/lib/flashcards'
import { cn } from '@/lib/utils'

/** A topic's cards as one bar, strongest first: mastered, known, learning, then new. */
export function MaturityBar({
  counts,
  color,
  className,
  label,
}: {
  counts: Record<Maturity, number>
  color: string
  className?: string
  label: string
}) {
  const total = MATURITY_STEPS.reduce((sum, s) => sum + counts[s.maturity], 0)
  const summary = MATURITY_STEPS.filter((s) => counts[s.maturity] > 0)
    .map((s) => `${counts[s.maturity]} ${s.label.toLowerCase()}`)
    .join(', ')
  return (
    <div className={cn('flex h-1.5 overflow-hidden rounded-full bg-muted', className)} role="img" aria-label={`${label}: ${summary}`}>
      {total > 0 &&
        MATURITY_STEPS.filter((s) => s.maturity !== 'new').map((s) => (
          <motion.div
            key={s.maturity}
            className="h-full"
            style={{ backgroundColor: maturityColor(s.maturity, color) }}
            initial={false}
            animate={{ width: `${(counts[s.maturity] / total) * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        ))}
    </div>
  )
}

/** The key for MaturityBar's colours. */
export function MaturityLegend({ color, className }: { color: string; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}>
      {MATURITY_STEPS.map((s) => (
        <li key={s.maturity} className="flex items-center gap-1.5">
          <span
            className={cn('size-2 rounded-full', s.maturity === 'new' && 'ring-1 ring-border ring-inset')}
            style={{ backgroundColor: maturityColor(s.maturity, color) }}
            aria-hidden
          />
          {s.label}
        </li>
      ))}
    </ul>
  )
}
