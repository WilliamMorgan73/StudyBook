// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Assignment, RevisionPlanStatus, RevisionSession } from '@/lib/api'

import { RevisionPlan } from './RevisionPlan'

const exam: Assignment = {
  id: 10,
  module_id: 1,
  title: 'Algorithms Exam',
  description: null,
  due_at: '2026-06-15T09:00:00',
  status: 'not_started',
  weight_percent: 50,
  grade_earned: null,
  grade_max: null,
  notes_markdown: '',
  kind: 'exam',
  duration_minutes: 120,
  location: 'Hall A',
  attachments: [],
  todos: [],
  covered_submodules: [{ id: 101, title: 'Sorting' }],
}

const mockSessions: RevisionSession[] = [
  {
    id: 1,
    assignment_id: 10,
    module_id: 1,
    exam_title: 'Algorithms Exam',
    starts_at: '2026-06-01T09:00:00',
    ends_at: '2026-06-01T10:00:00',
    duration_minutes: 60,
    done: true,
    guidance_markdown: null,
    submodules: [{ id: 101, title: 'Sorting' }],
  },
  {
    id: 2,
    assignment_id: 10,
    module_id: 1,
    exam_title: 'Algorithms Exam',
    starts_at: '2026-06-02T09:00:00',
    ends_at: '2026-06-02T10:00:00',
    duration_minutes: 60,
    done: false,
    guidance_markdown: null,
    submodules: [{ id: 101, title: 'Sorting' }],
  },
]

const mockStatus: RevisionPlanStatus = {
  needs_replan: true,
  planned_at: '2026-05-30T09:00:00',
  missed_session_ids: [],
  shifted_topics: [{ id: 101, title: 'Sorting', planned_weakness: 0.2, weakness: 0.8 }],
}

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listRevisionSessions: vi.fn(async () => mockSessions),
  getRevisionPlanStatus: vi.fn(async () => mockStatus),
  updateRevisionSession: vi.fn(async () => mockSessions[1]),
  deleteRevisionPlan: vi.fn(async () => {}),
}))

describe('RevisionPlan', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders sessions and collapsible header with progress', async () => {
    render(
      <MemoryRouter>
        <RevisionPlan exam={exam} />
      </MemoryRouter>,
    )

    // Header progress, buttons, and progress bar
    expect(await screen.findByText('1 of 2 done')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Replan/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /Clear plan/i })).not.toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Revision plan progress' })).not.toBeNull()

    // Replan nudge is rendered
    expect(screen.getByText(/Sorting got weaker/)).not.toBeNull()

    // Collapse toggle button exists and shows sessions when expanded
    const toggle = screen.getByRole('button', { name: /Revision plan/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByText('Sorting').length).toBeGreaterThan(0)

    // Click to collapse
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('studybook.revisionPlan.collapsed')).toBe('true')

    // Header actions, progress bar, and replan nudge remain visible when collapsed
    expect(screen.getByText('1 of 2 done')).not.toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Revision plan progress' })).not.toBeNull()
    expect(screen.getByText(/Sorting got weaker/)).not.toBeNull()
    expect(screen.getByRole('button', { name: /Clear plan/i })).not.toBeNull()
  })

  it('sorts incomplete sessions to top and completed sessions to bottom', async () => {
    render(
      <MemoryRouter>
        <RevisionPlan exam={exam} />
      </MemoryRouter>,
    )

    // Session 2 is done: false (starts June 2), Session 1 is done: true (starts June 1)
    // Incomplete should come first, so June 2 appears before June 1 in list rows
    const buttons = await screen.findAllByRole('button', { name: /Jun/i })
    expect(buttons[0].textContent).toMatch(/Jun 2|2 Jun/)
    expect(buttons[1].textContent).toMatch(/Jun 1|1 Jun/)
  })
})
