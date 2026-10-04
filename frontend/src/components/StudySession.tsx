import { CheckCircle2, GraduationCap } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

import { FlashcardFace } from '@/components/FlashcardFace'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { listDueFlashcards, reviewFlashcard, type Flashcard } from '@/lib/api'
import { RATINGS, studyKeyAction } from '@/lib/study'
import { useAsync } from '@/lib/useAsync'

const AGAIN = RATINGS.find((r) => r.rating === 'again')!.quality

const MotionButton = motion.create(Button)

export interface StudyScope {
  moduleId?: number
  submoduleId?: number
  /** Only the Module's cards that are on no topic. */
  noTopic?: boolean
}

/**
 * A "Study" button plus the session dialog it opens over the scope's due Flashcards.
 * `onFinished` runs when a session that reviewed at least one card is closed, so the caller can
 * refresh due counts once rather than after every review.
 */
export function StudySession({
  scope,
  title,
  onFinished,
  trigger,
}: {
  scope: StudyScope
  title: string
  onFinished?: () => void
  /** Renders whatever opens the session, in place of the default Study button. */
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setReviewed(0)
    } else if (reviewed > 0) {
      onFinished?.()
    }
  }

  return (
    <>
      {trigger ? (
        trigger(() => handleOpenChange(true))
      ) : (
        <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)}>
          <GraduationCap /> Study
        </Button>
      )}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Keep focus off the close button, or Space/Enter would close the dialog instead of revealing. */}
        <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Study · {title}</DialogTitle>
            <DialogDescription className="sr-only">Review the flashcards that are due.</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each session fetches a fresh snapshot of what's due. */}
          {open && (
            <SessionBody
              scope={scope}
              onReviewed={() => setReviewed((n) => n + 1)}
              onDone={() => handleOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SessionBody({ scope, onReviewed, onDone }: { scope: StudyScope; onReviewed: () => void; onDone: () => void }) {
  const { data: queue, loading, error } = useAsync(() => listDueFlashcards(scope), [])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  // The quality being saved (drives the button press) and the last one saved (picks the exit).
  const [pressed, setPressed] = useState<number | null>(null)
  const [lastQuality, setLastQuality] = useState<number | null>(null)

  const card = queue?.[index] ?? null

  // Read by AnimatePresence through `custom`, since an exiting card's own props are frozen.
  const cardVariants: Variants = {
    enter: { opacity: 0, x: 24 },
    center: { opacity: 1, x: 0, transition: { duration: 0.18 } },
    // "Again" shakes the card before it slides away.
    exit: (quality: number | null) =>
      quality === AGAIN
        ? { x: [0, -8, 8, -5, 5, 0, -24], opacity: [1, 1, 1, 1, 1, 1, 0], transition: { duration: 0.45 } }
        : { opacity: 0, x: -24, transition: { duration: 0.18 } },
  }

  async function rate(quality: number) {
    if (!card || submitting) return
    setSubmitting(true)
    setPressed(quality)
    setReviewError(null)
    try {
      await reviewFlashcard(card.id, quality)
      onReviewed()
      setLastQuality(quality)
      setIndex((i) => i + 1)
      setRevealed(false)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not save that review.')
    } finally {
      setSubmitting(false)
      setPressed(null)
    }
  }

  // Re-bound every render so the handler always sees the current card and reveal state.
  useEffect(() => {
    if (!card) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const action = studyKeyAction(e.key, revealed)
      if (!action) return
      e.preventDefault()
      if (action.type === 'reveal') setRevealed(true)
      else void rate(action.quality)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !queue) {
    return <p className="text-sm text-destructive">Couldn't load the due flashcards.</p>
  }

  if (!card) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        >
          <CheckCircle2 className="size-10 text-primary" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-lg font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">
            {queue.length === 0
              ? 'Nothing is due for review right now.'
              : `You reviewed ${queue.length} card${queue.length === 1 ? '' : 's'}.`}
          </p>
        </motion.div>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground tabular-nums">
          Card {index + 1} of {queue.length}
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${(index / queue.length) * 100}%` }}
          />
        </div>
      </div>

      {/* mode="wait" lets the rated card leave before the next one arrives, unflipped. */}
      <AnimatePresence mode="wait" initial={false} custom={lastQuality}>
        <motion.div key={card.id} variants={cardVariants} initial="enter" animate="center" exit="exit">
          <FlipCard card={card} revealed={revealed} />
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
      {revealed ? (
        <motion.div
          key="ratings"
          className="grid grid-cols-4 gap-2"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {RATINGS.map((r) => (
            <MotionButton
              key={r.rating}
              variant={r.rating === 'again' ? 'destructive' : r.rating === 'good' ? 'default' : 'secondary'}
              disabled={submitting}
              onClick={() => rate(r.quality)}
              // Driven by state rather than whileTap so 1–4 on the keyboard press the button too.
              animate={{ scale: pressed === r.quality ? 0.94 : 1 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
            >
              {r.label}
              <kbd className="ml-1 text-xs opacity-60">{r.key}</kbd>
            </MotionButton>
          ))}
        </motion.div>
      ) : (
        <motion.div
          key="reveal"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <MotionButton className="w-full" onClick={() => setRevealed(true)} whileTap={{ scale: 0.98 }}>
            Show answer
            <kbd className="ml-1 text-xs opacity-60">Space</kbd>
          </MotionButton>
        </motion.div>
      )}
      </AnimatePresence>

      {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}
    </div>
  )
}

/**
 * Both faces share one grid cell, so the card is as tall as its taller face without measuring.
 * The back repeats the question small above the answer, since flipping hides the front.
 */
function FlipCard({ card, revealed }: { card: Flashcard; revealed: boolean }) {
  const face = '[backface-visibility:hidden] [grid-area:1/1]'
  return (
    <div style={{ perspective: 1200 }}>
      <motion.div
        className="grid"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <FlashcardFace front={card.front} className={face} aria-hidden={revealed} />
        <FlashcardFace
          front={card.front}
          back={card.back}
          className={`${face} [transform:rotateY(180deg)]`}
          aria-hidden={!revealed}
        />
      </motion.div>
    </div>
  )
}
