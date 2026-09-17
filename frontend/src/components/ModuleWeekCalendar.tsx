import { useState } from 'react'

import type { Lecture } from '@/lib/api'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfWeek(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const mondayOffset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - mondayOffset)
  return d
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** A fixed (non-navigable) two-week grid — this week and next — showing only this module's lectures. */
export function ModuleWeekCalendar({ lectures, color }: { lectures: Lecture[]; color: string }) {
  const today = useState(() => new Date())[0]
  const weekStart = startOfWeek(today)
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i))
  const [selected, setSelected] = useState(today)

  const lecturesByDay = (day: Date) =>
    lectures
      .filter((l) => isSameDay(new Date(l.scheduled_at), day))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  const selectedLectures = lecturesByDay(selected)

  return (
    <div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-border bg-border text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-card px-1 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-t-0 border-border bg-border">
        {days.map((day) => {
          const dayLectures = lecturesByDay(day)
          const isToday = isSameDay(day, today)
          const isSelected = isSameDay(day, selected)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setSelected(day)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 bg-card p-1.5 transition-colors hover:bg-muted ${
                isSelected ? 'ring-2 ring-inset ring-foreground' : ''
              }`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs ${
                  isToday ? 'bg-foreground text-background' : ''
                }`}
              >
                {day.getDate()}
              </span>
              {dayLectures.length > 0 && (
                <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 border-t pt-3">
        <p className="mb-1.5 text-sm font-medium">
          {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        {selectedLectures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lectures this day.</p>
        ) : (
          <ul className="space-y-1">
            {selectedLectures.map((l) => {
              const start = new Date(l.scheduled_at)
              return (
                <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{l.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatTime(start)}
                    {l.duration_minutes && ` – ${formatTime(addMinutes(start, l.duration_minutes))}`}
                    {l.location && ` · ${l.location}`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
