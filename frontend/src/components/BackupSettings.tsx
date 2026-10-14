import { CircleCheck, Download, FolderOpen, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BACKUP_DOWNLOAD_URL,
  getDataLocation,
  getSavedBackups,
  restoreBackup,
  restoreSavedBackup,
  updateAppSettings,
  type AppSettings,
  type AppSettingsUpdate,
  type RestoreResult,
  type SavedBackup,
  type SavedBackups,
} from '@/lib/api'
import { formatBackupDate, formatBytes, savedBackupLabel, summarizeCounts } from '@/lib/backup'
import { formatSyncedAgo } from '@/lib/calendarFeeds'
import { isDesktop, onDownloadFinished, openFolder, type DownloadFinished } from '@/lib/desktop'
import { useAsync } from '@/lib/useAsync'

/** Settings → Data: automatic backups, download a backup, or restore one (uploaded or saved). */
export function BackupSettings({
  settings,
  onChanged,
  onRestored,
}: {
  settings: AppSettings
  /** App settings changed. */
  onChanged: () => void
  onRestored?: () => void
}) {
  const location = useAsync(() => getDataLocation(), [])
  const saved = useAsync(() => getSavedBackups(), [])
  return (
    <div className="space-y-8">
      {location.data && (
        <div className="space-y-1.5">
          <Label>Where your data is</Label>
          <p className="text-xs break-all text-muted-foreground">
            Everything is stored on this computer in <span className="font-mono">{location.data.data_dir}</span>
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Back up</Label>
        <p className="text-xs text-muted-foreground">
          Downloads one file with everything in StudyBook: modules, notes, assignments, flashcards and their review
          history, calendars, settings and attached files. Your AI API keys aren’t included.
        </p>
        <DownloadBackup />
      </div>
      <AutomaticBackups settings={settings} onChanged={onChanged} saved={saved.data} />
      <RestoreBackup onRestored={onRestored} saved={saved.data?.backups} />
    </div>
  )
}

const INTERVAL_OPTIONS: [days: number, label: string][] = [
  [1, 'Every day'],
  [7, 'Every week'],
]
const KEEP_OPTIONS = [3, 7, 14, 30]

/**
 * The scheduled backups the server writes to the backup folder (`services/auto_backup.py`). Choices
 * save straight away; they're local state so quick changes don't wait on the settings refetch.
 */
function AutomaticBackups({
  settings,
  onChanged,
  saved,
}: {
  settings: AppSettings
  onChanged: () => void
  saved: SavedBackups | null
}) {
  const [draft, setDraft] = useState({
    enabled: settings.auto_backup_enabled,
    intervalDays: settings.auto_backup_interval_days,
    keep: settings.auto_backup_keep,
  })
  const [openError, setOpenError] = useState<string | null>(null)

  async function save(next: typeof draft, change: AppSettingsUpdate) {
    setDraft(next)
    await updateAppSettings(change)
    onChanged()
  }

  const intervalOptions = withCurrent(INTERVAL_OPTIONS, draft.intervalDays, (days) => `Every ${days} days`)
  const keepOptions = withCurrent(
    KEEP_OPTIONS.map((n): [number, string] => [n, `Keep the last ${n}`]),
    draft.keep,
    (n) => `Keep the last ${n}`,
  )

  return (
    <div className="space-y-1.5">
      <Label>Automatic backups</Label>
      <p className="text-xs text-muted-foreground">
        Saves a backup on this computer on a schedule, while StudyBook is open. Older automatic backups are deleted;
        the copies saved before a restore or an app update are kept.
      </p>
      <div className="flex items-center gap-2 pt-1">
        <Checkbox
          id="auto-backup-enabled"
          checked={draft.enabled}
          onCheckedChange={(checked) =>
            save({ ...draft, enabled: checked === true }, { auto_backup_enabled: checked === true })
          }
        />
        <Label htmlFor="auto-backup-enabled" className="font-normal">
          Back up automatically
        </Label>
      </div>
      {draft.enabled && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Select
            value={String(draft.intervalDays)}
            onValueChange={(v) => save({ ...draft, intervalDays: Number(v) }, { auto_backup_interval_days: Number(v) })}
          >
            <SelectTrigger size="sm" aria-label="How often" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map(([days, label]) => (
                <SelectItem key={days} value={String(days)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(draft.keep)}
            onValueChange={(v) => save({ ...draft, keep: Number(v) }, { auto_backup_keep: Number(v) })}
          >
            <SelectTrigger size="sm" aria-label="How many to keep" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keepOptions.map(([n, label]) => (
                <SelectItem key={n} value={String(n)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {saved && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          <span>Last automatic backup: {formatSyncedAgo(saved.last_automatic_at)}</span>
          {isDesktop && (
            <Button
              size="xs"
              variant="link"
              className="h-auto px-0 text-xs"
              onClick={() => {
                setOpenError(null)
                openFolder(saved.folder).catch(() => setOpenError(`Couldn’t open ${saved.folder}`))
              }}
            >
              <FolderOpen />
              Open folder
            </Button>
          )}
        </div>
      )}
      {openError && <p className="text-xs break-all text-destructive">{openError}</p>}
      {saved?.last_error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span className="break-all">
            The last automatic backup failed ({formatSyncedAgo(saved.last_error.at)}): {saved.last_error.message}
          </span>
        </p>
      )}
    </div>
  )
}

/** The options, plus the current value if it isn't one of them (set some other way), so it still shows. */
function withCurrent(
  options: [number, string][],
  current: number,
  label: (value: number) => string,
): [number, string][] {
  if (options.some(([value]) => value === current)) return options
  return [...options, [current, label(current)] as [number, string]].sort((a, b) => a[0] - b[0])
}

type DownloadState = { phase: 'idle' } | { phase: 'saving' } | { phase: 'finished'; download: DownloadFinished }

/**
 * A plain download link, so a large backup never sits in memory. A browser shows its own download
 * progress; the desktop shell shows nothing, so there the backend's `download-finished` event drives a
 * "Preparing…" / "Saved to …" message instead.
 */
function DownloadBackup() {
  const [state, setState] = useState<DownloadState>({ phase: 'idle' })

  useEffect(
    () =>
      onDownloadFinished((download) => {
        if (isBackupUrl(download.url)) setState({ phase: 'finished', download })
      }),
    [],
  )

  return (
    <>
      <Button size="sm" variant="outline" className="mt-1" asChild>
        <a href={BACKUP_DOWNLOAD_URL} download onClick={() => isDesktop && setState({ phase: 'saving' })}>
          <Download />
          {state.phase === 'saving' ? 'Preparing backup…' : 'Download backup'}
        </a>
      </Button>
      {state.phase === 'finished' &&
        (state.download.success ? (
          <p role="status" className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
            <CircleCheck className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="break-all">
              {state.download.path ? `Saved to ${state.download.path}` : 'Backup saved to your Downloads folder'}
            </span>
          </p>
        ) : (
          <p className="pt-1 text-xs text-destructive">The backup couldn’t be saved. Try again.</p>
        ))}
    </>
  )
}

function isBackupUrl(url: string): boolean {
  try {
    return new URL(url, window.location.href).pathname === BACKUP_DOWNLOAD_URL
  } catch {
    return false
  }
}

/** What's being restored: a picked file, or a backup already in the backup folder. */
type RestoreSource = { kind: 'file'; file: File } | { kind: 'saved'; backup: SavedBackup }

type RestoreState =
  | { phase: 'idle' }
  | { phase: 'confirm'; source: RestoreSource }
  | { phase: 'restoring'; source: RestoreSource }
  | { phase: 'done'; result: RestoreResult }

function sourceName(source: RestoreSource): string {
  if (source.kind === 'file') return source.file.name
  return `${savedBackupLabel(source.backup.kind)}, ${formatBackupDate(`${source.backup.created_at}Z`)}`
}

/**
 * Pick a backup file (or one of the `saved` backups), confirm, restore. Restoring replaces everything,
 * so afterwards the whole app reloads from `/` (`onRestored` overrides that, for tests).
 */
export function RestoreBackup({
  onRestored = reloadApp,
  showHeading = true,
  saved,
}: {
  onRestored?: () => void
  /** Off where the surrounding dialog already explains restoring. */
  showHeading?: boolean
  /** Backups in the backup folder, listed to restore from directly. */
  saved?: SavedBackup[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<RestoreState>({ phase: 'idle' })
  const [error, setError] = useState<string | null>(null)

  function pick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '' // so picking the same file again still fires
    if (!file) return
    setError(null)
    setState({ phase: 'confirm', source: { kind: 'file', file } })
  }

  async function restore(source: RestoreSource) {
    setState({ phase: 'restoring', source })
    try {
      const result =
        source.kind === 'file' ? await restoreBackup(source.file) : await restoreSavedBackup(source.backup.name)
      setState({ phase: 'done', result })
      window.setTimeout(onRestored, RELOAD_DELAY_MS)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restoring failed.')
      setState({ phase: 'idle' })
    }
  }

  return (
    <div className="space-y-1.5">
      {showHeading && (
        <>
          <Label>Restore</Label>
          <p className="text-xs text-muted-foreground">
            Replaces everything in StudyBook with a backup’s contents. A copy of what’s here now is saved first.
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        data-testid="restore-backup-input"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {state.phase === 'idle' && (
        <>
          <Button size="sm" variant="outline" className="mt-1" onClick={() => inputRef.current?.click()}>
            <Upload />
            Restore from backup…
          </Button>
          {saved && saved.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className="text-xs text-muted-foreground">Or restore one saved on this computer:</p>
              <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border" aria-label="Saved backups">
                {saved.map((backup) => (
                  <li key={backup.name} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{formatBackupDate(`${backup.created_at}Z`)}</p>
                      <p className="truncate text-xs text-muted-foreground" title={backup.name}>
                        {savedBackupLabel(backup.kind)} · {formatBytes(backup.size_bytes)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Restore ${sourceName({ kind: 'saved', backup })}`}
                      onClick={() => {
                        setError(null)
                        setState({ phase: 'confirm', source: { kind: 'saved', backup } })
                      }}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {(state.phase === 'confirm' || state.phase === 'restoring') && (
        <div role="alert" className="mt-2 space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">Replace everything with this backup?</p>
              <p className="truncate text-muted-foreground" title={sourceName(state.source)}>
                {sourceName(state.source)}
              </p>
              <p className="text-muted-foreground">
                Everything currently in StudyBook is replaced. It’s saved as an automatic backup first, so this can be
                undone by restoring that file.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState({ phase: 'idle' })}
              disabled={state.phase === 'restoring'}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => restore(state.source)}
              disabled={state.phase === 'restoring'}
            >
              {state.phase === 'restoring' ? 'Restoring…' : 'Replace everything'}
            </Button>
          </div>
        </div>
      )}

      {state.phase === 'done' && (
        <div role="status" className="mt-2 space-y-1 rounded-lg border p-3 text-sm">
          <p className="font-medium">Restored the backup from {formatBackupDate(state.result.created_at)}</p>
          <p className="text-muted-foreground">{summarizeCounts(state.result.counts)}. Reloading…</p>
          <p className="text-xs break-all text-muted-foreground">
            The previous data was saved to {state.result.pre_restore_backup}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

const RELOAD_DELAY_MS = 1500

function reloadApp() {
  window.location.assign('/')
}
