import { Link } from 'react-router-dom'

import type { CalendarEvent } from '@/lib/api'

function groupByDay(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = new Date(event.starts_at).toDateString()
    const list = groups.get(key) ?? []
    list.push(event)
    groups.set(key, list)
  }
  return groups
}

export function CalendarAgenda({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing scheduled in this window.</p>
  }

  const groups = groupByDay(events)

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, dayEvents]) => (
        <div key={day}>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {new Date(dayEvents[0].starts_at).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          <ul className="space-y-1">
            {dayEvents.map((event) => (
              <li key={`${event.kind}-${event.id}`}>
                <Link
                  to={event.url}
                  className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      event.kind === 'lecture' ? 'bg-blue-500' : 'bg-amber-500'
                    }`}
                    aria-hidden
                  />
                  <span className="truncate">{event.title}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {new Date(event.starts_at).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
