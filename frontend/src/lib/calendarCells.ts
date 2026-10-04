/**
 * The line under a month calendar cell's event titles: "+N more" when some titles fit, or, when none
 * do, a plain count ("4 events"), since "+4 more" with nothing above it reads as missing events.
 */
export function overflowLabel(total: number, shown: number): string | null {
  const hidden = total - shown
  if (hidden <= 0) return null
  if (shown === 0) return `${total} ${total === 1 ? 'event' : 'events'}`
  return `+${hidden} more`
}
