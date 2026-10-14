import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { useOverview } from '@/components/dashboard/overviewContext'
import { EventMarker } from '@/components/EventMarker'
import { LoadSwap } from '@/components/LoadSwap'
import { StudySession } from '@/components/StudySession'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/components/WidgetError'
import { getCalendar, listDueFlashcards } from '@/lib/api'
import { formatSpan, nowWindow, pickNow, type NowItem } from '@/lib/now'
import { useSampleData } from '@/lib/sampleData'
import { useAsync } from '@/lib/useAsync'
import { useNow } from '@/lib/useNow'

/** How often the events and due cards are fetched again; the choice itself updates every minute. */
const REFRESH_MS = 5 * 60_000

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function label(item: NowItem): string {
  switch (item.kind) {
    case 'lecture':
      return item.phase === 'now' ? `Lecture now · ${formatSpan(item.minutes)} left` : `Lecture in ${formatSpan(item.minutes)}`
    case 'revision':
      return `Revision today · ${time(item.event.starts_at)}`
    case 'due':
      return `${item.event.kind === 'exam' ? 'Exam' : 'Due'} in ${formatSpan(item.minutes)}`
    case 'cards':
      return 'Flashcards'
    case 'later':
      return `Later today · ${time(item.event.starts_at)}`
  }
}

/** The big card: what it is, when, and a button or two to get there. */
function MainCard({ item, color, moduleName, onStudied }: { item: NowItem; color: string; moduleName: string; onStudied: () => void }) {
  if (item.kind === 'cards') {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-l-4 p-3" style={{ borderLeftColor: 'var(--primary)' }}>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label(item)}</p>
        <p className="text-lg leading-tight font-semibold">
          {item.count} card{item.count === 1 ? '' : 's'} due
        </p>
        <div>
          <StudySession scope={{}} title="All modules" onFinished={onStudied} />
        </div>
      </div>
    )
  }
  const e = item.event
  const meta = [e.kind === 'lecture' || e.kind === 'revision' ? `${time(e.starts_at)}${e.ends_at ? `–${time(e.ends_at)}` : ''}` : null, e.location, moduleName]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-l-4 p-3" style={{ borderLeftColor: color }}>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label(item)}</p>
      <div className="min-w-0">
        <p className="truncate text-lg leading-tight font-semibold">{e.title}</p>
        {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {e.kind === 'lecture' &&
          e.submodules.slice(0, 3).map((s) => (
            <Button key={s.id} asChild size="sm" variant="secondary">
              <Link to={`/modules/${e.module_id}/submodules/${s.id}`}>{s.title}</Link>
            </Button>
          ))}
        {e.url && (
          <Button asChild size="sm" variant={e.kind === 'lecture' && e.submodules.length > 0 ? 'ghost' : 'secondary'}>
            <Link to={e.url}>{e.kind === 'lecture' ? 'Open module' : e.kind === 'revision' ? 'Start revision' : 'Open'}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

function NextRow({ item, color, moduleName }: { item: NowItem; color: string; moduleName: string }) {
  if (item.kind === 'cards') {
    return (
      <li className="flex items-center gap-2 py-1.5 text-sm">
        <span className="min-w-0 flex-1 truncate">
          {item.count} flashcard{item.count === 1 ? '' : 's'} due
        </span>
      </li>
    )
  }
  const e = item.event
  const content = (
    <>
      <EventMarker kind={e.kind} color={color} className="shrink-0" />
      {/* Lecture titles are often just "Lecture", so the module says which. */}
      <span className="min-w-0 flex-1 truncate">
        {e.title}
        {moduleName && <span className="text-muted-foreground"> · {moduleName}</span>}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{label(item)}</span>
    </>
  )
  return (
    <li>
      {e.url ? (
        <Link to={e.url} className="-mx-1 flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
          {content}
        </Link>
      ) : (
        <div className="flex items-center gap-2 py-1.5 text-sm">{content}</div>
      )}
    </li>
  )
}

/**
 * Quick access chosen by the time of day (#89): the lecture you're in or about to be in, today's
 * revision, what's due soon, or cards to study; then up to two smaller "next" rows.
 */
export function NowWidget() {
  const { moduleColor, moduleName } = useOverview()
  const sample = useSampleData()
  const now = useNow(false)
  const events = useAsync(() => {
    if (sample) return Promise.resolve(sample.calendar)
    const { start, end } = nowWindow(new Date())
    return getCalendar(start, end)
  }, [])
  const due = useAsync(() => (sample ? Promise.resolve(sample.dueFlashcards) : listDueFlashcards({})), [])
  const { refetch: refetchEvents } = events
  const { refetch: refetchDue } = due

  useEffect(() => {
    if (sample) return
    const timer = setInterval(() => {
      void refetchEvents()
      void refetchDue()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [sample, refetchEvents, refetchDue])

  const picked = events.data && due.data ? pickNow(now, events.data, due.data.length) : null
  const colorOf = (item: NowItem) => ('event' in item ? moduleColor(item.event.module_id) : 'var(--primary)')
  const nameOf = (item: NowItem) => ('event' in item && item.event.module_id !== null ? moduleName(item.event.module_id) : '')

  return (
    <>
      {(events.error || due.error) && (
        <WidgetError
          message="Couldn't load what's on."
          onRetry={() => {
            void refetchEvents()
            void refetchDue()
          }}
          className="mb-2"
        />
      )}
      <LoadSwap loading={events.loading || due.loading} skeleton={<Skeleton className="h-28 w-full" />}>
        {picked &&
          (picked.main ? (
            <div className="flex flex-col gap-2">
              <MainCard item={picked.main} color={colorOf(picked.main)} moduleName={nameOf(picked.main)} onStudied={() => void refetchDue()} />
              {picked.next.length > 0 && (
                <ul className="divide-y">
                  {picked.next.map((item, i) => (
                    <NextRow key={i} item={item} color={colorOf(item)} moduleName={nameOf(item)} />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing on right now, and nothing due soon.</p>
          ))}
      </LoadSwap>
    </>
  )
}
