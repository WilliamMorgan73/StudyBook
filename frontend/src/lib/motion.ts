import type { Variants } from 'motion/react'

// Shared variants so every page enters and leaves the same way. Kept short-distance and quick:
// StudyBook is used daily, so motion should read as polish, not as something to wait for.

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
}

/** `fadeUp` with an explicit slot (`custom` = index), for siblings that don't share a parent. */
export const fadeUpAt: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: (i: number = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06 } }),
}

export function stagger(delay = 0.05): Variants {
  return {
    hidden: {},
    shown: { transition: { staggerChildren: delay } },
  }
}

/** For list rows under `AnimatePresence`: rises in, collapses out so siblings close the gap. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, height: 'auto' },
  // overflow can't animate, so it switches to hidden as the exit starts; the rest of the time the
  // row's focus rings stay unclipped.
  exit: { opacity: 0, height: 0, overflow: 'hidden' },
}

/** Spread onto a motion element to run a variant set from `hidden` to `shown` on mount. */
export const enter = { initial: 'hidden', animate: 'shown' } as const
