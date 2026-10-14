import type { SavedBackupKind } from '@/lib/api'

/** When a backup was made, in the student's locale. */
export function formatBackupDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'an unknown date'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const COUNT_LABELS: [table: string, one: string, many: string][] = [
  ['modules', 'module', 'modules'],
  ['submodules', 'topic', 'topics'],
  ['assignments', 'assignment', 'assignments'],
  ['flashcards', 'flashcard', 'flashcards'],
  ['attachments', 'file', 'files'],
]

/** "3 modules, 12 topics, 140 flashcards", skipping empty tables; "No data" when there's nothing. */
export function summarizeCounts(counts: Record<string, number>): string {
  const parts = COUNT_LABELS.filter(([table]) => (counts[table] ?? 0) > 0).map(
    ([table, one, many]) => `${counts[table]} ${counts[table] === 1 ? one : many}`,
  )
  return parts.length ? parts.join(', ') : 'No data'
}

const SAVED_BACKUP_LABELS: Record<SavedBackupKind, string> = {
  automatic: 'Automatic backup',
  'pre-restore': 'Before a restore',
  'pre-upgrade': 'Before an app update',
  other: 'Backup',
}

/** What a saved backup is, for the list in Settings → Data. */
export function savedBackupLabel(kind: SavedBackupKind): string {
  return SAVED_BACKUP_LABELS[kind]
}

/** "820 KB", "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
