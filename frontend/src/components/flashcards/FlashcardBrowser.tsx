import { Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { WidgetError } from '@/components/WidgetError'
import {
  createFlashcard,
  deleteFlashcard,
  listFlashcardReviews,
  listFlashcards,
  updateFlashcard,
  type Flashcard,
  type FlashcardReview,
} from '@/lib/api'
import { cardMaturity, FORGOTTEN_BELOW, isDue, MATURITY_STEPS, maturityColor, nextReviewLabel, ratingColor } from '@/lib/flashcards'
import { RATINGS } from '@/lib/study'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

/** Topic filter values: every card, the Module's cards on no topic, or one Submodule's id. */
type TopicFilter = 'all' | 'module' | `${number}`
const WHOLE_MODULE = 'module'
const DRAFT = 'draft'
type Selection = number | typeof DRAFT | null

interface Topic {
  id: number
  title: string
}

function topicValue(submoduleId: number | null): string {
  return submoduleId === null ? WHOLE_MODULE : String(submoduleId)
}

function inTopic(card: Flashcard, filter: TopicFilter): boolean {
  if (filter === 'all') return true
  return topicValue(card.submodule_id) === filter
}

/**
 * Anki-style card browser for one Module: the cards on the left, the selected card on the right
 * with its front, back and topic editable in place (saved as you leave a field) and how well
 * it's known. Opened from a topic's page (filtered to it) or the module's Flashcards block.
 */
export function FlashcardBrowser({
  open,
  onOpenChange,
  moduleId,
  topics,
  color,
  initialTopic = 'all',
  startWithNewCard = false,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  moduleId: number
  topics: readonly Topic[]
  color: string
  initialTopic?: TopicFilter
  /** Opens on an empty new card instead of the first card. */
  startWithNewCard?: boolean
  /** Runs when the dialog closes after any card was created, edited or deleted. */
  onChanged?: () => void
}) {
  const changedRef = useRef(false)

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next && changedRef.current) {
      changedRef.current = false
      onChanged?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(85vh,52rem)] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Flashcards</DialogTitle>
          <DialogDescription className="sr-only">
            Browse, add and edit this module's flashcards. Changes save as you leave each field.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from fresh cards and the given topic. */}
        {open && (
          <Browser
            moduleId={moduleId}
            topics={topics}
            color={color}
            initialTopic={initialTopic}
            startWithNewCard={startWithNewCard}
            onChange={() => (changedRef.current = true)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Browser({
  moduleId,
  topics,
  color,
  initialTopic,
  startWithNewCard,
  onChange,
}: {
  moduleId: number
  topics: readonly Topic[]
  color: string
  initialTopic: TopicFilter
  startWithNewCard: boolean
  onChange: () => void
}) {
  const cards = useAsync(() => listFlashcards({ moduleId }), [moduleId])
  const [filter, setFilter] = useState<TopicFilter>(initialTopic)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection>(startWithNewCard ? DRAFT : null)
  const listRef = useRef<HTMLUListElement>(null)
  const now = new Date()

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (cards.data ?? []).filter(
      (card) =>
        // The open card stays listed even if a topic change moved it out of the filter.
        (inTopic(card, filter) || card.id === selection) &&
        (!needle || card.front.toLowerCase().includes(needle) || card.back.toLowerCase().includes(needle)),
    )
  }, [cards.data, filter, query, selection])

  // Until something's picked, the first listed card is open (or a new one, if there are none).
  const fallback: Selection = cards.data ? (visible[0]?.id ?? DRAFT) : null
  const current: Selection = selection ?? fallback
  const selectedCard = typeof current === 'number' ? (cards.data?.find((c) => c.id === current) ?? null) : null
  const dueCount = visible.filter((c) => isDue(c, now)).length

  function select(next: Selection) {
    setSelection(next)
  }

  function handleListKey(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = visible.findIndex((c) => c.id === current)
    const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    select(next.id)
    listRef.current?.querySelector<HTMLElement>(`[data-card-id="${next.id}"]`)?.focus()
  }

  async function handleSaved(card: Flashcard, created: boolean) {
    onChange()
    await cards.refetch()
    if (created) setSelection(card.id)
  }

  async function handleDeleted(id: number) {
    onChange()
    const index = visible.findIndex((c) => c.id === id)
    const neighbour = visible[index + 1] ?? visible[index - 1]
    setSelection(neighbour ? neighbour.id : null)
    await cards.refetch()
  }

  const defaultTopic = filter === 'all' || filter === WHOLE_MODULE ? null : Number(filter)

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-1">
      <section aria-label="Cards" className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
        <div className="space-y-2 border-b p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards"
                aria-label="Search cards"
                className="pl-8"
              />
            </div>
            <Button size="sm" className="h-9" onClick={() => select(DRAFT)}>
              <Plus /> New card
            </Button>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as TopicFilter)}>
            <SelectTrigger size="sm" className="w-full" aria-label="Show cards from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              <SelectItem value={WHOLE_MODULE}>No topic</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cards.loading && (
            <div className="space-y-2 p-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}
          {cards.error && !cards.data && (
            <div className="p-3">
              <WidgetError message="Couldn't load the cards." onRetry={cards.refetch} />
            </div>
          )}
          {cards.data && visible.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {query ? 'No cards match your search.' : 'No cards here yet. Write the first one on the right.'}
            </p>
          )}
          {visible.length > 0 && (
            <ul ref={listRef} onKeyDown={handleListKey} className="py-1">
              {visible.map((card) => {
                const active = card.id === current
                const maturity = cardMaturity(card)
                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      data-card-id={card.id}
                      aria-current={active || undefined}
                      onClick={() => select(card.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted',
                        active && 'bg-muted',
                      )}
                      // The module colour marks the open card, as a stripe on its leading edge.
                      style={active ? { boxShadow: `inset 2px 0 0 ${color}` } : undefined}
                    >
                      <span
                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', maturity === 'new' && 'ring-1 ring-border ring-inset')}
                        style={{ backgroundColor: maturityColor(maturity, color) }}
                        title={MATURITY_STEPS.find((s) => s.maturity === maturity)!.label}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{card.front}</span>
                        <span className="block truncate text-xs text-muted-foreground">{card.back}</span>
                      </span>
                      {isDue(card, now) && (
                        <span className="mt-0.5 shrink-0 text-xs text-muted-foreground" title="Due for review">
                          Due
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {cards.data && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground tabular-nums">
            {visible.length} card{visible.length === 1 ? '' : 's'}, {dueCount} due
          </p>
        )}
      </section>

      <section aria-label="Card" className="min-h-0 overflow-y-auto">
        {current === DRAFT && (
          <CardEditor
            key={`draft-${defaultTopic}`}
            card={null}
            moduleId={moduleId}
            defaultTopic={defaultTopic}
            topics={topics}
            color={color}
            onSaved={handleSaved}
            onDeleted={() => setSelection(null)}
          />
        )}
        {selectedCard && (
          <CardEditor
            key={selectedCard.id}
            card={selectedCard}
            moduleId={moduleId}
            defaultTopic={defaultTopic}
            topics={topics}
            color={color}
            onSaved={handleSaved}
            onDeleted={() => handleDeleted(selectedCard.id)}
          />
        )}
      </section>
    </div>
  )
}

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

/**
 * One card's fields. Saves when a field loses focus, the topic changes, or the editor goes away
 * (another card picked, dialog closed). A new card is created once both sides have text.
 */
function CardEditor({
  card,
  moduleId,
  defaultTopic,
  topics,
  color,
  onSaved,
  onDeleted,
}: {
  card: Flashcard | null
  moduleId: number
  defaultTopic: number | null
  topics: readonly Topic[]
  color: string
  onSaved: (card: Flashcard, created: boolean) => void
  onDeleted: () => void
}) {
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [topic, setTopic] = useState(topicValue(card ? card.submodule_id : defaultTopic))
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })

  // What's on the server, and what's on screen, for saves that run after a re-render or unmount.
  const saved = useRef({ front: card?.front ?? '', back: card?.back ?? '', topic: topicValue(card ? card.submodule_id : defaultTopic) })
  // Kept in step by the change handlers, so a save straight after a change reads the new value.
  const fields = useRef({ front, back, topic })
  const createdRef = useRef<Flashcard | null>(null)
  const [created, setCreated] = useState(false)
  const deletedRef = useRef(false)
  const inFlight = useRef<Promise<void> | null>(null)

  async function save() {
    // One save at a time: a blur and an unmount can land together.
    if (inFlight.current) await inFlight.current
    if (deletedRef.current) return
    const { front, back, topic } = fields.current
    const f = front.trim()
    const b = back.trim()
    const existing = card ?? createdRef.current
    const submodule_id = topic === WHOLE_MODULE ? null : Number(topic)

    if (!existing) {
      if (!f || !b) return
      inFlight.current = (async () => {
        setStatus({ kind: 'saving' })
        try {
          const created = await createFlashcard({ module_id: moduleId, submodule_id, front: f, back: b })
          createdRef.current = created
          setCreated(true)
          saved.current = { front: f, back: b, topic }
          setStatus({ kind: 'saved' })
          onSaved(created, true)
        } catch (err) {
          setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Could not add the card.' })
        }
      })()
    } else {
      const changes: { front?: string; back?: string; submodule_id?: number | null } = {}
      if (f && f !== saved.current.front) changes.front = f
      if (b && b !== saved.current.back) changes.back = b
      if (topic !== saved.current.topic) changes.submodule_id = submodule_id
      if (Object.keys(changes).length === 0) return
      inFlight.current = (async () => {
        setStatus({ kind: 'saving' })
        try {
          const updated = await updateFlashcard(existing.id, changes)
          saved.current = { front: updated.front, back: updated.back, topic: topicValue(updated.submodule_id) }
          setStatus({ kind: 'saved' })
          onSaved(updated, false)
        } catch (err) {
          setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save the card.' })
        }
      })()
    }
    await inFlight.current
    inFlight.current = null
  }

  // Picking another card or closing the dialog unmounts this without a blur, so save then too.
  const saveRef = useRef(save)
  useLayoutEffect(() => {
    saveRef.current = save
  })
  useEffect(() => () => void saveRef.current(), [])

  const blankFront = card !== null && !front.trim()
  const blankBack = card !== null && !back.trim()

  return (
    <div className="space-y-5 p-5">
      <CardField
        id="card-front"
        label="Front"
        value={front}
        onChange={(value) => {
          setFront(value)
          fields.current = { ...fields.current, front: value }
        }}
        onBlur={() => void save()}
        placeholder="Question, term or prompt"
        invalid={blankFront}
        autoFocus={card === null}
        minHeight="min-h-24"
      />
      <CardField
        id="card-back"
        label="Back"
        value={back}
        onChange={(value) => {
          setBack(value)
          fields.current = { ...fields.current, back: value }
        }}
        onBlur={() => void save()}
        placeholder="Answer"
        invalid={blankBack}
        minHeight="min-h-32"
        hint="Markdown and maths ($x^2$, $$…$$) render when you leave the field."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="card-topic" className="text-muted-foreground">
          Topic
        </Label>
        <Select
          value={topic}
          onValueChange={(value) => {
            setTopic(value)
            fields.current = { ...fields.current, topic: value }
            void save()
          }}
        >
          <SelectTrigger id="card-topic" size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={WHOLE_MODULE}>No topic</SelectItem>
            {topics.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SaveIndicator status={status} isNew={card === null && !created} blank={blankFront || blankBack} />
      </div>

      {card ? (
        <Understanding card={card} color={color} />
      ) : (
        <p className="text-sm text-muted-foreground">The card is added once both sides have text.</p>
      )}

      {card && (
        <div className="border-t pt-4">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              // Nothing left to save: stop a later blur or unmount save from touching the card.
              deletedRef.current = true
              await deleteFlashcard(card.id)
              onDeleted()
            }}
          >
            <Trash2 /> Delete card
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * A card side: rendered (markdown, KaTeX maths, images) until clicked or focused, then a
 * textarea until it loses focus. Empty sides stay as a textarea.
 */
function CardField({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  invalid,
  autoFocus,
  minHeight,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  placeholder: string
  invalid: boolean
  autoFocus?: boolean
  minHeight: string
  hint?: string
}) {
  const [editing, setEditing] = useState(false)
  const showEditor = editing || !value.trim()

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {showEditor ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            setEditing(false)
            onBlur()
          }}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          className={cn(minHeight, 'rounded-xl border-transparent bg-muted/40 text-base md:text-base dark:bg-muted/40')}
          autoFocus={autoFocus || editing}
        />
      ) : (
        <div
          id={id}
          role="button"
          tabIndex={0}
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={() => setEditing(true)}
          onFocus={() => setEditing(true)}
          className={cn(
            minHeight,
            'cursor-text rounded-xl border border-transparent bg-muted/40 px-2.5 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:border-ring',
          )}
        >
          <MarkdownView>{value}</MarkdownView>
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SaveIndicator({ status, isNew, blank }: { status: SaveStatus; isNew: boolean; blank: boolean }) {
  let text: string | null = null
  if (blank) text = 'Both sides need text to save.'
  else if (status.kind === 'saving') text = isNew ? 'Adding…' : 'Saving…'
  else if (status.kind === 'saved') text = 'Saved'
  else if (status.kind === 'error') text = status.message
  if (!text) return null
  return (
    <span
      role="status"
      className={cn('ml-auto text-xs', blank || status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')}
    >
      {text}
    </span>
  )
}

function ratingLabel(quality: number): string {
  if (quality < FORGOTTEN_BELOW) return 'Again'
  return RATINGS.find((r) => r.quality === quality)?.label ?? 'Good'
}

/** How the card is going: its maturity, next review, and a strip of recent ratings. */
function Understanding({ card, color }: { card: Flashcard; color: string }) {
  const reviews = useAsync(() => listFlashcardReviews(card.id), [card.id, card.last_reviewed_at])
  const maturity = cardMaturity(card)
  const step = MATURITY_STEPS.find((s) => s.maturity === maturity)!

  return (
    <section aria-labelledby="understanding-heading" className="space-y-4 rounded-xl bg-muted/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="understanding-heading" className="text-sm font-medium">
          Understanding
        </h3>
        <span className="flex items-center gap-1.5 text-sm">
          <span
            className={cn('size-2.5 rounded-full', maturity === 'new' && 'ring-1 ring-border ring-inset')}
            style={{ backgroundColor: maturityColor(maturity, color) }}
            aria-hidden
          />
          {step.label}
        </span>
      </div>

      {maturity === 'new' ? (
        <p className="text-sm text-muted-foreground">Not studied yet. It'll come up in your next study session.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Next review</dt>
              <dd>{nextReviewLabel(card.due_at, new Date())}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Gap between reviews</dt>
              <dd className="tabular-nums">
                {card.interval_days} day{card.interval_days === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ease</dt>
              <dd className="tabular-nums">{Math.round(card.ease_factor * 100)}%</dd>
            </div>
          </dl>
          <RatingsStrip reviews={reviews.data} color={color} />
        </>
      )}
    </section>
  )
}

const BAR_HEIGHT: Record<string, string> = { Again: '30%', Hard: '55%', Good: '80%', Easy: '100%' }

function RatingsStrip({ reviews, color }: { reviews: FlashcardReview[] | null; color: string }) {
  if (!reviews) return <Skeleton className="h-10 w-full" />
  if (reviews.length === 0) return null
  const oldestFirst = [...reviews].reverse()
  const forgotten = reviews.filter((r) => r.quality < FORGOTTEN_BELOW).length
  return (
    <div className="space-y-1.5">
      <div className="flex h-10 items-end gap-1" role="img" aria-label={`Recent ratings, oldest first: ${oldestFirst.map((r) => ratingLabel(r.quality)).join(', ')}`}>
        {oldestFirst.map((r, i) => {
          const label = ratingLabel(r.quality)
          return (
            <span
              key={i}
              className="w-2.5 rounded-sm"
              title={`${label}, ${new Date(r.reviewed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
              style={{
                height: BAR_HEIGHT[label],
                backgroundColor: ratingColor(r.quality, color),
              }}
            />
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {reviews.length === 20 ? 'Last 20 reviews' : `${reviews.length} review${reviews.length === 1 ? '' : 's'}`},{' '}
        {forgotten === 0 ? 'never forgotten' : `forgotten ${forgotten === 1 ? 'once' : `${forgotten} times`}`}
      </p>
    </div>
  )
}
