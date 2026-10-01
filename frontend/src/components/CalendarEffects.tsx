import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

// Motion shared by the Overview month calendar and the module page's two-week calendar.

/**
 * The selected-day outline. Rendered only inside the selected cell (which must be `relative`);
 * sharing a `layoutId` across cells makes it glide from the old day to the new one.
 */
export function SelectionRing({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      className="pointer-events-none absolute inset-0 ring-2 ring-foreground ring-inset"
      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
    />
  )
}

/** Springs an event marker in from nothing when it first appears. */
export function PopIn({ children }: { children: ReactNode }) {
  return (
    <motion.span
      className="inline-flex"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
    >
      {children}
    </motion.span>
  )
}

/** Cross-fades the selected day's event list whenever `dayKey` changes. */
export function DaySwap({ dayKey, children }: { dayKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={dayKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
