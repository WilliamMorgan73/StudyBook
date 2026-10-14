import { useState } from 'react'

import { useOverview } from '@/components/dashboard/overviewContext'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { FlashcardFace } from '@/components/FlashcardFace'
import { LoadSwap } from '@/components/LoadSwap'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/components/WidgetError'
import { listDueFlashcards, reviewFlashcard } from '@/lib/api'
import { CARD_OF_THE_DAY_CONFIG } from '@/lib/cardOfTheDay'
import { FORGOTTEN_BELOW, formatInterval } from '@/lib/flashcards'
import { useSampleData } from '@/lib/sampleData'
import { RATINGS } from '@/lib/study'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

/**
 * One due card at a time, right on the dashboard (#96): show the answer, rate it with the same
 * ratings and scheduling as a study session, and the next due card takes its place. When the
 * queue runs out it fetches again, so cards rated Again come back once they're due.
 */
export function CardOfTheDayWidget() {
  const [cfg] = useWidgetConfig(CARD_OF_THE_DAY_CONFIG)
  const { moduleColor, moduleName } = useOverview()
  const sample = useSampleData()
  const due = useAsync(
    () =>
      sample
        ? Promise.resolve(sample.dueFlashcards.filter((c) => cfg.moduleId === null || c.module_id === cfg.moduleId))
        : listDueFlashcards(cfg.moduleId === null ? {} : { moduleId: cfg.moduleId }),
    [cfg.moduleId],
  )
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(0)
  // A new scope or a refetch starts the queue again.
  const [queueOf, setQueueOf] = useState(due.data)
  if (queueOf !== due.data) {
    setQueueOf(due.data)
    setIndex(0)
    setRevealed(false)
  }

  const queue = due.data ?? []
  const card = queue[index]

  async function rate(quality: number) {
    if (!card) return
    setSubmitting(true)
    setError(null)
    try {
      if (!sample) await reviewFlashcard(card.id, quality)
      setReviewed((n) => n + 1)
      setRevealed(false)
      if (index + 1 < queue.length) setIndex(index + 1)
      else await due.refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the review.")
    } finally {
      setSubmitting(false)
    }
  }

  const color = card ? moduleColor(card.module_id) : 'var(--primary)'

  return (
    <>
      {due.error && <WidgetError message="Couldn't load flashcards." onRetry={due.refetch} className="mb-2" />}
      <LoadSwap loading={due.loading && !due.data} skeleton={<Skeleton className="h-32 w-full" />}>
        {due.data &&
          (!card ? (
            <p className="text-sm text-muted-foreground">
              {reviewed > 0 ? `All done: ${reviewed} reviewed. No more cards due.` : 'No cards due.'}
            </p>
          ) : (
            <div className="flex min-h-full flex-col gap-2">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{moduleName(card.module_id)}</span>
                <span className="shrink-0 tabular-nums">
                  {queue.length - index} due{reviewed > 0 ? ` · ${reviewed} done` : ''}
                </span>
              </p>
              <FlashcardFace
                front={card.front}
                back={revealed ? card.back : undefined}
                className="min-h-0 flex-1 p-3"
                style={{ borderTop: `3px solid ${color}` }}
              />
              {revealed ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {RATINGS.map((r) => {
                    const forgot = r.quality < FORGOTTEN_BELOW
                    const interval = card.next_intervals[r.quality]
                    return (
                      <button
                        key={r.rating}
                        type="button"
                        disabled={submitting}
                        onClick={() => void rate(r.quality)}
                        className={cn(
                          'flex flex-col items-center rounded-lg border py-1 text-xs font-medium transition-colors disabled:opacity-60',
                          forgot ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15' : 'bg-card hover:bg-muted',
                        )}
                      >
                        {r.label}
                        {interval !== undefined && (
                          <span className={cn('font-normal tabular-nums', forgot ? 'opacity-70' : 'text-muted-foreground')}>
                            {formatInterval(interval)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <Button size="sm" onClick={() => setRevealed(true)}>
                  Show answer
                </Button>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          ))}
      </LoadSwap>
    </>
  )
}

export function CardOfTheDaySettings() {
  const [cfg, setCfg] = useWidgetConfig(CARD_OF_THE_DAY_CONFIG)
  const { modules } = useOverview()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="card-of-the-day-module">Cards from</Label>
      <Select
        value={cfg.moduleId === null ? 'all' : String(cfg.moduleId)}
        onValueChange={(v) => setCfg({ moduleId: v === 'all' ? null : Number(v) })}
      >
        <SelectTrigger id="card-of-the-day-module" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Every module</SelectItem>
          {(modules.data ?? []).map((m) => (
            <SelectItem key={m.id} value={String(m.id)}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
