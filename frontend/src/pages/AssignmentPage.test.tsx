// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Assignment, ModuleRead } from '@/lib/api'

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
}))

describe('AssignmentPage notes', () => {
  it('renders inline and display maths with KaTeX', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/modules/3/assignments/7']}>
        <Routes>
          <Route path="/modules/:moduleId/assignments/:assignmentId" element={<AssignmentPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const notes = (await screen.findByText(/Merge sort runs in/)).closest('section')!
    expect(notes.querySelector('.katex')).not.toBeNull()
    expect(notes.querySelector('.katex-display')).not.toBeNull()
    expect(notes.textContent).not.toContain('$')
    expect(container.querySelector('.prose.prose-sm')).not.toBeNull()
  })
})
