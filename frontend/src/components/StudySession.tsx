import { AlertCircle, GraduationCap } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

import { ErrorState } from '@/components/ErrorState'
import { FlashcardFace } from '@/components/FlashcardFace'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { listDueFlashcards, reviewFlashcard, type FlashcardDue } from '@/lib/api'
import { FORGOTTEN_BELOW, formatInterval, ratingColor } from '@/lib/flashcards'
import { RATINGS, studyKeyAction } from '@/lib/study'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const AGAIN = RATINGS.find((r) => r.rating === 'again')!.quality

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
  color = 'var(--primary)',
  onFinished,
  trigger,
}: {
  scope: StudyScope
  title: string
  /** The module's colour: the card's top edge and the review trail. */
  color?: string
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
        <DialogContent
          className="flex h-[min(80vh,46rem)] flex-col gap-0 p-0 sm:max-w-3xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-5 pr-12 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              <span className="truncate">{title}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">Review the flashcards that are due.</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each session fetches a fresh snapshot of what's due. */}
          {open && (
            <SessionBody
              scope={scope}
              color={color}
              onReviewed={() => setReviewed((n) => n + 1)}
              onDone={() => handleOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * One tick per card in the session, filled in its rating's colour once reviewed: the session's
 * running picture of how it's going, drawn again larger on the summary.
 */
function ReviewTrail({
  total,
  ratings,
  current,
  color,
  large = false,
}: {
  total: number
  ratings: number[]
  current: number | null
  color: string
  large?: boolean
}) {
  return (
    <div
      className={cn('flex w-full gap-1', large ? 'h-3' : 'h-1.5')}
      role="img"
      aria-label={`${ratings.length} of ${total} reviewed`}
    >
      {Array.from({ length: total }, (_, i) => {
        const quality = ratings[i]
        return (
          <motion.span
            key={i}
            className="min-w-0.5 flex-1 rounded-full"
            initial={false}
            animate={{
              backgroundColor:
                quality !== undefined
                  ? ratingColor(quality, color)
                  : i === current
                    ? 'color-mix(in oklab, var(--foreground) 35%, transparent)'
                    : 'var(--muted)',
            }}
            transition={{ duration: 0.25 }}
          />
        )
      })}
    </div>
  )
}

function SessionBody({
  scope,
  color,
  onReviewed,
  onDone,
}: {
  scope: StudyScope
  color: string
  onReviewed: () => void
  onDone: () => void
}) {
  const { data: queue, loading, error } = useAsync(() => listDueFlashcards(scope), [])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  // The quality being saved (drives the button press) and each saved one, in order (the trail).
  const [pressed, setPressed] = useState<number | null>(null)
  const [ratings, setRatings] = useState<number[]>([])
  const reduceMotion = useReducedMotion()

  const card = queue?.[index] ?? null
  const lastQuality = ratings.at(-1) ?? null

  // Read by AnimatePresence through `custom`, since an exiting card's own props are frozen.
  const cardVariants: Variants = reduceMotion
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
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
      setRatings((r) => [...r, quality])
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
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="mx-auto h-72 w-full max-w-2xl rounded-2xl" />
      </div>
    )
  }

  if (error || !queue) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorState
          icon={AlertCircle}
          iconVariant="destructive"
          title="Couldn't load flashcards"
          description="There was a problem loading the due cards for this study session. Close this dialog and try again."
          primaryAction={{
            label: 'Close',
            onClick: onDone,
          }}
          compact
        />
      </div>
    )
  }

  if (!card) return <Summary total={queue.length} ratings={ratings} color={color} onDone={onDone} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-4 px-6 pt-4 pb-2">
        <ReviewTrail total={queue.length} ratings={ratings} current={index} color={color} />
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{queue.length - index} left</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 py-4">
        {/* mode="wait" lets the rated card leave before the next one arrives, unflipped. */}
        <AnimatePresence mode="wait" initial={false} custom={lastQuality}>
          <motion.div
            key={card.id}
            className="mx-auto w-full max-w-2xl"
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <FlipCard card={card} revealed={revealed} color={color} flip={!reduceMotion} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 pt-2 pb-6">
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
                <RatingButton
                  key={r.rating}
                  label={r.label}
                  shortcut={r.key}
                  interval={card.next_intervals[r.quality]}
                  forgot={r.quality < FORGOTTEN_BELOW}
                  color={color}
                  pressed={pressed === r.quality}
                  disabled={submitting}
                  onClick={() => rate(r.quality)}
                />
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
              <Button size="lg" className="h-14 w-full text-base" onClick={() => setRevealed(true)}>
                Show answer
                <kbd className="ml-1 text-xs opacity-60">Space</kbd>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {reviewError && <p className="mt-2 text-sm text-destructive">{reviewError}</p>}
      </div>
    </div>
  )
}

/** A rating tile: the rating, when the card would next come up with it, and its key. */
function RatingButton({
  label,
  shortcut,
  interval,
  forgot,
  color,
  pressed,
  disabled,
  onClick,
}: {
  label: string
  shortcut: string
  interval: number | undefined
  forgot: boolean
  color: string
  pressed: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // Driven by state rather than whileTap so 1–4 on the keyboard press the tile too.
      animate={{ scale: pressed ? 0.95 : 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className={cn(
        'group flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
        forgot
          ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
          : 'bg-card hover:border-[var(--rating-color)] hover:bg-[color-mix(in_oklab,var(--rating-color)_10%,transparent)]',
      )}
      style={{ '--rating-color': color } as CSSProperties}
    >
      <span>
        {label}
        <kbd className="ml-1.5 font-normal opacity-40">{shortcut}</kbd>
      </span>
      {interval !== undefined && (
        <span className={cn('text-xs font-normal tabular-nums', forgot ? 'opacity-70' : 'text-muted-foreground')}>
          {formatInterval(interval)}
        </span>
      )}
    </motion.button>
  )
}

function Summary({
  total,
  ratings,
  color,
  onDone,
}: {
  total: number
  ratings: number[]
  color: string
  onDone: () => void
}) {
  if (total === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-medium">Nothing to review right now</p>
        <p className="max-w-sm text-sm text-muted-foreground">Cards come back here when they're due. Check again later.</p>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }
  const counts = RATINGS.map((r) => ({
    label: r.label.toLowerCase(),
    count: ratings.filter((q) => (r.quality < FORGOTTEN_BELOW ? q < FORGOTTEN_BELOW : q === r.quality)).length,
  })).filter((c) => c.count > 0)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="w-full max-w-md">
        <ReviewTrail total={total} ratings={ratings} current={null} color={color} large />
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-medium">
          You reviewed {total} card{total === 1 ? '' : 's'}
        </p>
        <p className="text-sm text-muted-foreground">{counts.map((c) => `${c.count} ${c.label}`).join(', ')}</p>
      </div>
      <Button onClick={onDone}>Done</Button>
    </div>
  )
}

/**
 * Both faces share one grid cell, so the card is as tall as its taller face without measuring.
 * The back repeats the question small above the answer, since flipping hides the front. With
 * reduced motion there's no flip: the answer face just replaces the question.
 */
function FlipCard({ card, revealed, color, flip }: { card: FlashcardDue; revealed: boolean; color: string; flip: boolean }) {
  if (!flip) {
    return revealed ? (
      <FlashcardFace size="study" accent={color} front={card.front} back={card.back} />
    ) : (
      <FlashcardFace size="study" accent={color} front={card.front} />
    )
  }
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
        <FlashcardFace size="study" accent={color} front={card.front} className={face} aria-hidden={revealed} />
        <FlashcardFace
          size="study"
          accent={color}
          front={card.front}
          back={card.back}
          className={`${face} [transform:rotateY(180deg)]`}
          aria-hidden={!revealed}
        />
      </motion.div>
    </div>
  )
}
