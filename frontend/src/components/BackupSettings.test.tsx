// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, restoreBackup, type RestoreResult } from '@/lib/api'

import { BackupSettings } from './BackupSettings'

const RESULT: RestoreResult = {
  created_at: '2026-10-04T12:00:00+00:00',
  counts: { modules: 2, submodules: 5 },
  pre_restore_backup: '/data/backups/pre-restore-20261004.zip',
}

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  restoreBackup: vi.fn(async () => RESULT),
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

  it('downloads the backup through a plain link', () => {
    render(<BackupSettings />)
    const link = screen.getByRole('link', { name: /download backup/i })
    expect(link.getAttribute('href')).toBe('/api/backup')
    expect(link.hasAttribute('download')).toBe(true)
  })

  it('asks before restoring, and Cancel restores nothing', () => {
    render(<BackupSettings onRestored={vi.fn()} />)
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
    render(<BackupSettings onRestored={onRestored} />)
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
    render(<BackupSettings onRestored={onRestored} />)
    pickFile()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Replace everything' })))

    expect(screen.getByText(/made by a newer version/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /restore from backup/i })).toBeTruthy()
    expect(onRestored).not.toHaveBeenCalled()
  })
})
