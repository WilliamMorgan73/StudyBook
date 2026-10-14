// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  getSavedBackups,
  restoreBackup,
  restoreSavedBackup,
  updateAppSettings,
  type AppSettings,
  type RestoreResult,
  type SavedBackups,
} from '@/lib/api'

import { BackupSettings } from './BackupSettings'

const SETTINGS = {
  auto_backup_enabled: true,
  auto_backup_interval_days: 1,
  auto_backup_keep: 7,
} as AppSettings

const SAVED: SavedBackups = {
  folder: '/data/backups',
  last_automatic_at: null,
  last_error: null,
  backups: [
    { name: 'auto-20261014-090000.zip', kind: 'automatic', created_at: '2026-10-14T08:00:00', size_bytes: 2_500_000 },
    { name: 'pre-upgrade-abc.zip', kind: 'pre-upgrade', created_at: '2026-10-01T08:00:00', size_bytes: 900 },
  ],
}

const RESULT: RestoreResult = {
  created_at: '2026-10-04T12:00:00+00:00',
  counts: { modules: 2, submodules: 5 },
  pre_restore_backup: '/data/backups/pre-restore-20261004.zip',
}

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  restoreBackup: vi.fn(async () => RESULT),
  restoreSavedBackup: vi.fn(async () => RESULT),
  getSavedBackups: vi.fn(async () => SAVED),
  updateAppSettings: vi.fn(async () => SETTINGS),
  getDataLocation: vi.fn(async () => ({ data_dir: '/home/me/.local/share/com.willmorgan.studybook' })),
}))

const backupFile = () => new File(['zip'], 'studybook-backup-2026-10-04.zip', { type: 'application/zip' })

function pickFile(file = backupFile()) {
  fireEvent.change(screen.getByTestId('restore-backup-input'), { target: { files: [file] } })
}

describe('BackupSettings', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows where the data is stored', async () => {
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} />)
    expect(await screen.findByText('/home/me/.local/share/com.willmorgan.studybook')).toBeTruthy()
  })

  it('downloads the backup through a plain link', () => {
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} />)
    const link = screen.getByRole('link', { name: /download backup/i })
    expect(link.getAttribute('href')).toBe('/api/backup')
    expect(link.hasAttribute('download')).toBe(true)
  })

  it('asks before restoring, and Cancel restores nothing', () => {
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} onRestored={vi.fn()} />)
    pickFile()

    expect(screen.getByText('Replace everything with this backup?')).toBeTruthy()
    expect(screen.getByText('studybook-backup-2026-10-04.zip')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(restoreBackup).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /restore from backup/i })).toBeTruthy()
  })

  it('restores after confirming, shows what came back, then reloads', async () => {
    vi.useFakeTimers()
    const onRestored = vi.fn()
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} onRestored={onRestored} />)
    const file = backupFile()
    pickFile(file)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Replace everything' })))

    expect(restoreBackup).toHaveBeenCalledWith(file)
    expect(screen.getByRole('status').textContent).toContain('2 modules, 5 topics')
    expect(screen.getByRole('status').textContent).toContain(RESULT.pre_restore_backup)
    expect(onRestored).not.toHaveBeenCalled()
    act(() => vi.runAllTimers())
    expect(onRestored).toHaveBeenCalledOnce()
  })

  it('shows the server’s reason when a backup is rejected', async () => {
    vi.mocked(restoreBackup).mockRejectedValueOnce(
      new ApiError('This backup was made by a newer version of StudyBook. Update StudyBook first.', 422, null),
    )
    const onRestored = vi.fn()
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} onRestored={onRestored} />)
    pickFile()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Replace everything' })))

    expect(screen.getByText(/made by a newer version/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /restore from backup/i })).toBeTruthy()
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('restores a saved backup after confirming', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onRestored = vi.fn()
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} onRestored={onRestored} />)

    const list = await screen.findByRole('list', { name: 'Saved backups' })
    expect(list.textContent).toContain('Automatic backup · 2.4 MB')
    expect(list.textContent).toContain('Before an app update · 900 B')
    fireEvent.click(screen.getAllByRole('button', { name: /^Restore Automatic backup/ })[0])
    expect(screen.getByText('Replace everything with this backup?')).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Replace everything' })))

    expect(restoreSavedBackup).toHaveBeenCalledWith('auto-20261014-090000.zip')
    expect(restoreBackup).not.toHaveBeenCalled()
    act(() => vi.runAllTimers())
    expect(onRestored).toHaveBeenCalledOnce()
  })

  it('saves automatic backup choices straight away', async () => {
    const onChanged = vi.fn()
    render(<BackupSettings settings={SETTINGS} onChanged={onChanged} />)

    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: 'Back up automatically' })))

    expect(updateAppSettings).toHaveBeenCalledWith({ auto_backup_enabled: false })
    expect(onChanged).toHaveBeenCalledOnce()
    expect(screen.queryByRole('combobox', { name: 'How often' })).toBeNull()
  })

  it('shows when the last automatic backup was made, and a failure', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-14T11:00:00Z'), shouldAdvanceTime: true })
    vi.mocked(getSavedBackups).mockResolvedValueOnce({
      ...SAVED,
      last_automatic_at: '2026-10-14T08:00:00',
      last_error: { at: '2026-10-14T10:00:00', message: 'No space left on device' },
    })
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} />)

    expect(await screen.findByText('Last automatic backup: 3 h ago')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(
      'The last automatic backup failed (1 h ago): No space left on device',
    )
    expect(screen.queryByRole('button', { name: /open folder/i })).toBeNull() // desktop only
  })
})
