import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** How long the tick stays up before fading out, in ms. */
const HOLD_MS = 900

/**
 * A large tick that pops up in the middle of the screen and fades away. Plays each time
 * `trigger` changes (pass a counter you bump). Portalled to <body> so the route wrapper's
 * transform can't shift a `fixed` overlay off-centre.
 */
export function CompletionTick({ trigger }: { trigger: number }) {
  const [lastTrigger, setLastTrigger] = useState(trigger)
  const [showing, setShowing] = useState<number | null>(null)
  if (trigger !== lastTrigger) {
    setLastTrigger(trigger)
    setShowing(trigger)
  }

  useEffect(() => {
    if (showing === null) return
    const timeout = setTimeout(() => setShowing(null), HOLD_MS)
    return () => clearTimeout(timeout)
  }, [showing])

  return createPortal(
    <AnimatePresence>
      {showing !== null && (
        <motion.div
          key={showing}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-12"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* lucide's Check path, drawn on */}
              <motion.path
                d="M20 6 9 17l-5-5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.15, duration: 0.3, ease: 'easeOut' }}
              />
            </svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
