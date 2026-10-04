import { CircleCheck, Download, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BACKUP_DOWNLOAD_URL, restoreBackup, type RestoreResult } from '@/lib/api'
import { formatBackupDate, summarizeCounts } from '@/lib/backup'
import { isDesktop, onDownloadFinished, type DownloadFinished } from '@/lib/desktop'

/** Settings → Data: download a backup, or restore one. */
export function BackupSettings({ onRestored }: { onRestored?: () => void }) {
  return (
    <div className="space-y-8">
      <div className="space-y-1.5">
        <Label>Back up</Label>
        <p className="text-xs text-muted-foreground">
          Downloads one file with everything in StudyBook: modules, notes, assignments, flashcards and their review
          history, calendars, settings and attached files. Your AI API keys aren’t included.
        </p>
        <DownloadBackup />
      </div>
      <RestoreBackup onRestored={onRestored} />
    </div>
  )
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

type RestoreState =
  | { phase: 'idle' }
  | { phase: 'confirm'; file: File }
  | { phase: 'restoring'; file: File }
  | { phase: 'done'; result: RestoreResult }

/**
 * Pick a backup file, confirm, restore. Restoring replaces everything, so afterwards the whole app
 * reloads from `/` (`onRestored` overrides that, for tests).
 */
export function RestoreBackup({
  onRestored = reloadApp,
  showHeading = true,
}: {
  onRestored?: () => void
  /** Off where the surrounding dialog already explains restoring. */
  showHeading?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<RestoreState>({ phase: 'idle' })
  const [error, setError] = useState<string | null>(null)

  function pick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '' // so picking the same file again still fires
    if (!file) return
    setError(null)
    setState({ phase: 'confirm', file })
  }

  async function restore(file: File) {
    setState({ phase: 'restoring', file })
    try {
      const result = await restoreBackup(file)
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
        <Button size="sm" variant="outline" className="mt-1" onClick={() => inputRef.current?.click()}>
          <Upload />
          Restore from backup…
        </Button>
      )}

      {(state.phase === 'confirm' || state.phase === 'restoring') && (
        <div role="alert" className="mt-2 space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">Replace everything with this backup?</p>
              <p className="truncate text-muted-foreground" title={state.file.name}>
                {state.file.name}
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
              onClick={() => restore(state.file)}
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
