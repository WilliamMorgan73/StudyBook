import { Link } from 'react-router-dom'

import { AnimatePresence, motion } from 'motion/react'

import { DaySwap } from '@/components/CalendarEffects'
import { useOverview } from '@/components/dashboard/overviewContext'
import { EventMarker } from '@/components/EventMarker'
import { Checkbox } from '@/components/ui/checkbox'
import type { CalendarEvent } from '@/lib/api'
import { calendarEventKey } from '@/lib/busyTime'
import { calendarEventColor } from '@/lib/calendarFeeds'

/** Height + fade for a panel that opens below its row. */
const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2 },
  style: { overflow: 'hidden' },
} as const

const EVENT_LINK_LABEL: Record<CalendarEvent['kind'], string> = {
  lecture: 'Open module',
  assignment_due: 'Open assignment',
  exam: 'Open exam',
  busy: 'Open module',
  revision: 'Open session',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * The selected calendar day's events. Click one to toggle its details. Rendered by the Day agenda
 * widget, or inline under the Calendar widget's grid when that widget isn't placed.
 */
export function DayAgenda() {
  const { calendar, moduleName, moduleColor } = useOverview()
  const { selected, selectedDayEvents, expandedEventKey, toggleEvent, setRevisionDone } = calendar

  return (
    <DaySwap dayKey={selected.toDateString()}>
      {selectedDayEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
      ) : (
        <ul className="space-y-1">
          {selectedDayEvents.map((event) => {
            const key = calendarEventKey(event)
            const isExpanded = expandedEventKey === key
            const isBusy = event.kind === 'busy'
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => toggleEvent(key)}
                  className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <EventMarker
                    kind={event.kind}
                    color={calendarEventColor(event, moduleColor)}
                    done={event.done === true}
                    className="shrink-0"
                  />
                  <span
                    className={`truncate ${isBusy || event.done ? 'text-muted-foreground' : ''} ${event.done ? 'line-through' : ''}`}
                  >
                    {event.title}
                  </span>
                  {event.module_id !== null && (
                    <span className="truncate text-muted-foreground">{moduleName(event.module_id)}</span>
                  )}
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {event.kind === 'assignment_due' ? 'Due' : event.all_day ? 'All day' : formatTime(event.starts_at)}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && event.kind !== 'assignment_due' && (
                    <motion.div {...reveal} className="ml-4 space-y-0.5 px-2 pb-2 text-xs text-muted-foreground">
                      <p>
                        {event.all_day ? (
                          'All day'
                        ) : (
                          <>
                            {formatTime(event.starts_at)}
                            {event.ends_at && ` – ${formatTime(event.ends_at)}`}
                          </>
                        )}
                      </p>
                      {event.location && <p>{event.location}</p>}
                      {isBusy && (
                        <p>{event.feed_id != null ? 'Calendar feed' : 'Personal event'} (Settings → Calendars)</p>
                      )}
                      {event.kind === 'revision' && (
                        <label className="flex w-fit cursor-pointer items-center gap-1.5 text-foreground">
                          <Checkbox
                            checked={event.done === true}
                            onCheckedChange={(checked) => setRevisionDone(event.id, checked === true)}
                          />
                          Done
                        </label>
                      )}
                      {event.url && (
                        <Link to={event.url} className="inline-block text-foreground hover:underline">
                          {EVENT_LINK_LABEL[event.kind]} &rarr;
                        </Link>
                      )}
                    </motion.div>
                  )}
                  {isExpanded && event.kind === 'assignment_due' && event.url && (
                    <motion.div {...reveal} className="ml-4 space-y-0.5 px-2 pb-2 text-xs text-muted-foreground">
                      <Link to={event.url} className="inline-block text-foreground hover:underline">
                        Open assignment &rarr;
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      )}
    </DaySwap>
  )
}
