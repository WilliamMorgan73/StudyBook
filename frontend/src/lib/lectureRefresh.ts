import type { ModuleLecturesRefreshed } from '@/lib/api'

/** One line for the module page after a lecture refresh. */
export function refreshSummary(result: ModuleLecturesRefreshed): string {
  const parts: string[] = []
  if (result.added > 0) parts.push(`${result.added} new lecture${result.added === 1 ? '' : 's'}`)
  if (result.linked.length > 0) parts.push(`linked ${result.linked.map((t) => `“${t}”`).join(', ')}`)
  if (result.failed.length > 0) parts.push(`couldn’t reach ${result.failed.join(', ')}`)
  if (parts.length === 0) return 'Lectures are up to date'
  const line = parts.join(' · ')
  return line[0].toUpperCase() + line.slice(1)
}
