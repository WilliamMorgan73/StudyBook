import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createPersonalEvent,
  deletePersonalEvent,
  listPersonalEvents,
  updatePersonalEvent,
  type PersonalEvent,
} from '@/lib/api'
import {
  formatWeekdays,
  personalEventFormState,
  personalEventPayload,
  timeInputValue,
  toggleWeekday,
  WEEKDAY_LABELS,
  type PersonalEventFormState,
} from '@/lib/busyTime'
import { useAsync } from '@/lib/useAsync'

const pad = (n: number) => String(n).padStart(2, '0')

function todayValue() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "YYYY-MM-DD" as a local date (`new Date("YYYY-MM-DD")` would parse it as UTC midnight). */
function formatDate(date: string) {
  return new Date(`${date}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function PersonalEventForm({
  event,
  onSaved,
  onCancel,
}: {
  event?: PersonalEvent
  onSaved: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<PersonalEventFormState>(() => personalEventFormState(event, todayValue()))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<PersonalEventFormState>) => setForm((f) => ({ ...f, ...patch }))
  const overnight = form.startTime && form.endTime && form.endTime < form.startTime

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const payload = personalEventPayload(form)
    if ('error' in payload) {
      setError(payload.error)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (event) await updatePersonalEvent(event.id, payload)
      else await createPersonalEvent(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the event.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-muted/50 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="personal-event-title">Title</Label>
        <Input
          id="personal-event-title"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Work shift"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Repeats on</Label>
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, day) => {
            const on = form.weekdays.includes(day)
            return (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                aria-pressed={on}
                onClick={() => set({ weekdays: toggleWeekday(form.weekdays, day) })}
                className="w-11"
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="personal-event-start">Start time</Label>
          <Input
            id="personal-event-start"
            type="time"
            value={form.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="personal-event-end">End time</Label>
          <Input
            id="personal-event-end"
            type="time"
            value={form.endTime}
            onChange={(e) => set({ endTime: e.target.value })}
          />
        </div>
      </div>
      {overnight && <p className="text-xs text-muted-foreground">Ends the next day.</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="personal-event-from">Valid from</Label>
          <Input
            id="personal-event-from"
            type="date"
            value={form.validFrom}
            onChange={(e) => set({ validFrom: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="personal-event-until">Valid until</Label>
          <Input
            id="personal-event-until"
            type="date"
            value={form.validUntil}
            min={form.validFrom || undefined}
            onChange={(e) => set({ validUntil: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Both dates are inclusive. Leave valid until blank to repeat indefinitely.</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Saving…' : event ? 'Save changes' : 'Add event'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function PersonalEventItem({ event, onChanged }: { event: PersonalEvent; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${event.title}"?`)) return
    await deletePersonalEvent(event.id)
    onChanged()
  }

  if (editing) {
    return (
      <li className="py-2">
        <PersonalEventForm
          event={event}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  const start = timeInputValue(event.start_time)
  const end = timeInputValue(event.end_time)
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{event.title}</p>
        <p className="text-sm text-muted-foreground">
          {formatWeekdays(event.weekdays)}, {start}–{end}
          {end < start && ' (next day)'} &middot;{' '}
          {event.valid_until
            ? `${formatDate(event.valid_from)} – ${formatDate(event.valid_until)}`
            : `from ${formatDate(event.valid_from)}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </li>
  )
}

/** Settings → Calendars: recurring personal events that count as busy time. */
export function PersonalEventsSettings({ onChanged }: { onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const { data: events, loading, error, refetch: refetchEvents } = useAsync(() => listPersonalEvents(), [])

  function refetch() {
    void refetchEvents()
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Personal events</h3>
          <p className="text-xs text-muted-foreground">
            Recurring commitments like work shifts or training. They show as busy time on the Overview calendar.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="shrink-0">
            Add event
          </Button>
        )}
      </div>

      {adding && (
        <PersonalEventForm
          onSaved={() => {
            setAdding(false)
            refetch()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading && <Skeleton className="h-24 w-full" />}
      {error && <p className="text-sm text-destructive">Couldn't load personal events.</p>}
      {events?.length === 0 && !adding && <p className="text-sm text-muted-foreground">No personal events yet.</p>}
      {events && events.length > 0 && (
        <ul className="divide-y">
          {events.map((event) => (
            <PersonalEventItem key={event.id} event={event} onChanged={refetch} />
          ))}
        </ul>
      )}
    </div>
  )
}
