import type { CalendarEvent } from '@/lib/api'

/**
 * "just now", "12 min ago", "3 h ago", "2 days ago", or "never". `lastSyncedAt` is the backend's
 * naive UTC timestamp, so it's read as UTC.
 */
export function formatSyncedAgo(lastSyncedAt: string | null, now: Date = new Date()): string {
  if (!lastSyncedAt) return 'never'
  const minutes = Math.floor((now.getTime() - new Date(`${lastSyncedAt}Z`).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/** A busy event's own colour (calendar feeds have one), else its module's. */
export function calendarEventColor(event: CalendarEvent, moduleColor: (moduleId: number | null) => string): string {
  return event.color ?? moduleColor(event.module_id)
}
