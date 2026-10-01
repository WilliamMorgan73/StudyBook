import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Shows `skeleton` while `loading`, then cross-fades to `children`. Whatever is showing on first
 * mount appears as-is, so already-loaded content doesn't fade in for no reason.
 */
export function LoadSwap({
  loading,
  skeleton,
  children,
  className,
}: {
  loading: boolean
  skeleton: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div key="skeleton" className={className} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          className={className}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
