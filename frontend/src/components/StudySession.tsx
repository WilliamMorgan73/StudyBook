import { CheckCircle2, GraduationCap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { listDueFlashcards, reviewFlashcard } from '@/lib/api'
import { RATINGS, studyKeyAction } from '@/lib/study'
import { useAsync } from '@/lib/useAsync'

export interface StudyScope {
  moduleId?: number
  submoduleId?: number
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
}: {
  scope: StudyScope
  title: string
  onFinished?: () => void
}) {
  const [open, setOpen] = useState(false)
  const reviewedRef = useRef(0)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      reviewedRef.current = 0
    } else if (reviewedRef.current > 0) {
      onFinished?.()
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)}>
        <GraduationCap /> Study
      </Button>
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
              onReviewed={() => (reviewedRef.current += 1)}
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

  const card = queue?.[index] ?? null

  async function rate(quality: number) {
    if (!card || submitting) return
    setSubmitting(true)
    setReviewError(null)
    try {
      await reviewFlashcard(card.id, quality)
      onReviewed()
      setIndex((i) => i + 1)
      setRevealed(false)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not save that review.')
    } finally {
      setSubmitting(false)
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
        <CheckCircle2 className="size-10 text-primary" />
        <div>
          <p className="text-lg font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">
            {queue.length === 0
              ? 'Nothing is due for review right now.'
              : `You reviewed ${queue.length} card${queue.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground tabular-nums">
        Card {index + 1} of {queue.length}
      </p>

      <div className="min-h-48 space-y-4 rounded-xl border bg-muted/30 p-6">
        <MarkdownView>{card.front}</MarkdownView>
        {revealed && (
          <>
            <hr />
            <MarkdownView>{card.back}</MarkdownView>
          </>
        )}
      </div>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <Button
              key={r.rating}
              variant={r.rating === 'again' ? 'destructive' : r.rating === 'good' ? 'default' : 'secondary'}
              disabled={submitting}
              onClick={() => rate(r.quality)}
            >
              {r.label}
              <kbd className="ml-1 text-xs opacity-60">{r.key}</kbd>
            </Button>
          ))}
        </div>
      ) : (
        <Button className="w-full" onClick={() => setRevealed(true)}>
          Show answer
          <kbd className="ml-1 text-xs opacity-60">Space</kbd>
        </Button>
      )}

      {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}
    </div>
  )
}
