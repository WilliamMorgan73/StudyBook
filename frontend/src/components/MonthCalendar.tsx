import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useMemo, useState } from 'react'

import { PopIn, SelectionRing } from '@/components/CalendarEffects'
import { EventMarker } from '@/components/EventMarker'
import { Button } from '@/components/ui/button'
import type { CalendarEvent } from '@/lib/api'
import { busyLast, calendarEventKey } from '@/lib/busyTime'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfCalendarGrid(monthStart: Date) {
  const mondayOffset = (monthStart.getDay() + 6) % 7
  return addDays(monthStart, -mondayOffset)
}

export function calendarGridRange(month: Date) {
  const start = startOfCalendarGrid(startOfMonth(month))
  return { start, end: addDays(start, 42) }
}

export function MonthCalendar({
  month,
  onMonthChange,
  events,
  selected,
  onSelect,
  eventColor,
}: {
  month: Date
  onMonthChange: (month: Date) => void
  events: CalendarEvent[]
  selected: Date | null
  onSelect: (date: Date) => void
  eventColor: (event: CalendarEvent) => string
}) {
  const days = useMemo(() => {
    const gridStart = startOfCalendarGrid(startOfMonth(month))
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [month])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = new Date(event.starts_at).toDateString()
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [events])

  const today = new Date()

  const uid = useId()

  // Which way the last month change went (0 before any), so the new grid slides in from that side.
  const [shownMonth, setShownMonth] = useState(month)
  const [direction, setDirection] = useState(0)
  if (month.getTime() !== shownMonth.getTime()) {
    setDirection(month > shownMonth ? 1 : -1)
    setShownMonth(month)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMonthChange(addMonths(month, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMonthChange(startOfMonth(new Date()))}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="Next month"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-border bg-border text-xs text-muted-foreground">
        {WEEKDAYS.map((day) => (
          <div key={day} className="bg-card px-1 py-1.5 text-center">
            {day}
          </div>
        ))}
      </div>
      <motion.div
        // Remounting per month is what lets the new grid slide in.
        key={month.toISOString()}
        initial={direction !== 0 ? { opacity: 0, x: direction * 12 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-t-0 border-border bg-border"
      >
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth()
          const dayEvents = eventsByDay.get(day.toDateString()) ?? []
          const isToday = isSameDay(day, today)
          const isSelected = selected !== null && isSameDay(day, selected)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={`relative flex min-h-11 flex-col items-start gap-1 bg-card p-1.5 text-left transition-colors hover:bg-muted ${
                inMonth ? '' : 'opacity-40'
              }`}
            >
              {isSelected && <SelectionRing layoutId={`${uid}-selection`} />}
              <span
                className={`flex size-5 items-center justify-center rounded-full text-xs ${
                  isToday ? 'bg-foreground text-background' : ''
                }`}
              >
                {day.getDate()}
              </span>
              {dayEvents.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5">
                  {busyLast(dayEvents).slice(0, 4).map((event) => (
                    <PopIn key={calendarEventKey(event)}>
                      <EventMarker kind={event.kind} color={eventColor(event)} done={event.done === true} />
                    </PopIn>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </motion.div>
    </div>
  )
}
