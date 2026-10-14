// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppSettings } from '@/lib/api'
import type { DownloadFinished } from '@/lib/desktop'

import { BackupSettings } from './BackupSettings'

const SETTINGS = { auto_backup_enabled: true, auto_backup_interval_days: 1, auto_backup_keep: 7 } as AppSettings
const openFolder = vi.fn(async (_path: string) => {})

// In the desktop shell, the webview's download gives no sign of its own; the shell's
// `download-finished` event is what tells the student it worked.
let emit: (download: DownloadFinished) => void = () => {}
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getDataLocation: vi.fn(async () => ({ data_dir: '/data' })),
  getSavedBackups: vi.fn(async () => ({ folder: '/data/backups', last_automatic_at: null, last_error: null, backups: [] })),
}))
vi.mock('@/lib/desktop', () => ({
  isDesktop: true,
  onDownloadFinished: (handler: (download: DownloadFinished) => void) => {
    emit = handler
    return () => {}
  },
  openFolder: (path: string) => openFolder(path),
}))

describe('BackupSettings in the desktop shell', () => {
  afterEach(cleanup)

  it('shows where the backup was saved once the download finishes', () => {
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} />)
    const link = screen.getByRole('link', { name: /download backup/i })
    link.addEventListener('click', (e) => e.preventDefault()) // jsdom can't navigate
    fireEvent.click(link)
    expect(screen.getByRole('link', { name: /preparing backup/i })).toBeTruthy()

    act(() => emit({ url: 'http://localhost:5173/api/backup', path: '/home/me/Downloads/b.zip', success: true }))

    expect(screen.getByRole('status').textContent).toBe('Saved to /home/me/Downloads/b.zip')
    expect(screen.getByRole('link', { name: /download backup/i })).toBeTruthy()
  })

  it('ignores other downloads, and says so when the save failed', () => {
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} />)

    act(() => emit({ url: 'http://localhost:5173/uploads/x.pdf', path: '/tmp/x.pdf', success: true }))
    expect(screen.queryByRole('status')).toBeNull()

    act(() => emit({ url: 'http://localhost:5173/api/backup', path: null, success: false }))
    expect(screen.getByText(/couldn’t be saved/)).toBeTruthy()
  })

  it('opens the backup folder', async () => {
    render(<BackupSettings settings={SETTINGS} onChanged={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: /open folder/i }))

    expect(openFolder).toHaveBeenCalledWith('/data/backups')
  })
})
