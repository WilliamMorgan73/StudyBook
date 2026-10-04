// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Attachment } from '@/lib/api'
import { formatFileSize } from '@/lib/utils'

import { AttachmentEmbeds } from './AttachmentEmbeds'

function attachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: 1,
    submodule_id: null,
    assignment_id: 10,
    kind: 'pdf',
    filename: 'brief.pdf',
    file_path: 'uploads/assignments/10/a.pdf',
    url: '/uploads/assignments/10/a.pdf',
    uploaded_at: '2026-10-01T09:00:00',
    size_bytes: 1_258_291,
    text_extractable: true,
    ...overrides,
  }
}

const files = [
  attachment({}),
  attachment({ id: 2, kind: 'pptx', filename: 'slides.pptx', url: '/uploads/assignments/10/b.pptx', size_bytes: 86_016 }),
  attachment({ id: 3, kind: 'image', filename: 'rubric.png', size_bytes: null }),
]

function renderRail() {
  render(<AttachmentEmbeds attachments={files} upload={async () => files[0]} onChanged={() => {}} />)
}

describe('AttachmentEmbeds', () => {
  afterEach(cleanup)

  it('lists each file compactly with its type and size, without inline previews', () => {
    renderRail()

    expect(screen.getByText('PDF, 1.2 MB')).not.toBeNull()
    expect(screen.getByText('Slides, 84 KB')).not.toBeNull()
    expect(screen.getByText('Image')).not.toBeNull()
    expect(document.querySelector('iframe, img')).toBeNull()
  })

  it('previews a PDF in a dialog when its row is clicked', () => {
    renderRail()

    fireEvent.click(screen.getByTitle('Preview brief.pdf'))

    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('iframe')?.getAttribute('src')).toBe('/uploads/assignments/10/a.pdf#view=FitH&navpanes=0')
    expect(screen.getByRole('link', { name: /open in new tab/i }).getAttribute('href')).toBe('/uploads/assignments/10/a.pdf')
  })

  it('opens files the browser cannot preview in a new tab', () => {
    renderRail()

    const link = screen.getByTitle('Open slides.pptx')
    expect(link.getAttribute('href')).toBe('/uploads/assignments/10/b.pptx')
    expect(link.getAttribute('target')).toBe('_blank')
  })
})

describe('formatFileSize', () => {
  it('reads like people write sizes', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(86_016)).toBe('84 KB')
    expect(formatFileSize(1_258_291)).toBe('1.2 MB')
  })
})
