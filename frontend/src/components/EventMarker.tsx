import type { CalendarEvent } from '@/lib/api'

const SHAPE: Record<CalendarEvent['kind'], string> = {
  lecture: 'size-1.5 rounded-full',
  assignment_due: 'size-1.5 rotate-45 rounded-[1px]',
  exam: 'size-2 rounded-[1px]',
  busy: 'h-1 w-2.5 rounded-full',
  revision: 'size-2 rounded-full border-[1.5px]',
}

/**
 * The calendar glyph for an event kind: dot = lecture, diamond = assignment due, square = exam,
 * dash = busy, ring = revision session (filled in once `done`). Busy time belongs to no module, so
 * it's always muted: grey, or faded `color` for a calendar feed's events.
 */
export function EventMarker({
  kind,
  color,
  done = false,
  className = '',
}: {
  kind: CalendarEvent['kind']
  color?: string
  done?: boolean
  className?: string
}) {
  if (kind === 'busy') {
    return (
      <span
        className={`${SHAPE.busy} ${color ? 'opacity-60' : 'bg-muted-foreground/50'} ${className}`}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden
      />
    )
  }
  if (kind === 'revision') {
    return (
      <span
        className={`${SHAPE.revision} ${color ? '' : 'border-current'} ${done && !color ? 'bg-current' : ''} ${className}`}
        style={color ? { borderColor: color, backgroundColor: done ? color : undefined } : undefined}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={`${SHAPE[kind]} ${color ? '' : 'bg-current'} ${className}`}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  )
}
