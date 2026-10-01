import type { CalendarEvent } from '@/lib/api'

const SHAPE: Record<CalendarEvent['kind'], string> = {
  lecture: 'size-1.5 rounded-full',
  assignment_due: 'size-1.5 rotate-45 rounded-[1px]',
  exam: 'size-2 rounded-[1px]',
  busy: 'h-1 w-2.5 rounded-full',
}

/**
 * The calendar glyph for an event kind: dot = lecture, diamond = assignment due, square = exam,
 * dash = busy. Busy time belongs to no module, so it's always muted and ignores `color`.
 */
export function EventMarker({ kind, color, className = '' }: { kind: CalendarEvent['kind']; color?: string; className?: string }) {
  if (kind === 'busy') return <span className={`${SHAPE.busy} bg-muted-foreground/50 ${className}`} aria-hidden />
  return (
    <span
      className={`${SHAPE[kind]} ${color ? '' : 'bg-current'} ${className}`}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  )
}
