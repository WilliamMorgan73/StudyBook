import type { CalendarEvent } from '@/lib/api'

const SHAPE: Record<CalendarEvent['kind'], string> = {
  lecture: 'size-1.5 rounded-full',
  assignment_due: 'size-1.5 rotate-45 rounded-[1px]',
  exam: 'size-2 rounded-[1px]',
}

/** The calendar glyph for an event kind: dot = lecture, diamond = assignment due, square = exam. */
export function EventMarker({ kind, color, className = '' }: { kind: CalendarEvent['kind']; color?: string; className?: string }) {
  return (
    <span
      className={`${SHAPE[kind]} ${color ? '' : 'bg-current'} ${className}`}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  )
}
