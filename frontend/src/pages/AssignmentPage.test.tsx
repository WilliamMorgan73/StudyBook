// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, getAssignment, type Assignment, type ModuleRead } from '@/lib/api'

import { AssignmentPage } from './AssignmentPage'

const assignment: Assignment = {
  id: 7,
  module_id: 3,
  title: 'Sorting coursework',
  description: null,
  due_at: null,
  status: 'not_started',
  weight_percent: 20,
  grade_earned: null,
  grade_max: null,
  notes_markdown: 'Merge sort runs in $O(n \\log n)$.\n\n$$\nT(n) = 2T(n/2) + n\n$$',
  kind: 'coursework',
  duration_minutes: null,
  location: null,
  attachments: [],
  todos: [],
  covered_submodules: [],
}

const module: ModuleRead = { id: 3, name: 'Algorithms', code: null, color: '#3366ff', term: null, credits: null }

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getAssignment: vi.fn(async () => assignment),
  getModule: vi.fn(async () => module),
  getAppSettings: vi.fn(() => new Promise(() => {})),
}))

afterEach(cleanup)

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/modules/3/assignments/7']}>
      <Routes>
        <Route path="/modules/:moduleId/assignments/:assignmentId" element={<AssignmentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AssignmentPage notes', () => {
  it('renders inline and display maths with KaTeX', async () => {
    renderPage()

    // The notes are the live editor: maths off the cursor line renders as KaTeX widgets.
    const notes = (await screen.findByText(/Merge sort runs in/)).closest('.cm-editor')!
    expect(notes.querySelector('.katex')).not.toBeNull()
    expect(notes.querySelector('.katex-display')).not.toBeNull()
  })
})

describe('AssignmentPage load failures', () => {
  it('says the assignment is gone when the backend answers 404', async () => {
    vi.mocked(getAssignment).mockRejectedValueOnce(new ApiError('Assignment not found', 404, null))
    renderPage()

    expect(await screen.findByText('Assignment not found')).toBeTruthy()
    expect(screen.queryByText('Server offline')).toBeNull()
  })

  it('shows the offline state when the backend is unreachable, and Retry loads the page', async () => {
    vi.mocked(getAssignment).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPage()

    expect(await screen.findByText('Server offline')).toBeTruthy()
    expect(screen.queryByText('Assignment not found')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Retry connection/ }))
    expect(await screen.findByText(/Merge sort runs in/)).toBeTruthy()
  })
})
