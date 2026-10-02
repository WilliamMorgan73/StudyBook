// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Todo } from '@/lib/api'

import { AssignmentChecklist } from './AssignmentChecklist'

const mockTodos: Todo[] = [
  { id: 1, assignment_id: 10, text: 'Step 1', done: true, created_at: '2026-06-01T09:00:00' },
  { id: 2, assignment_id: 10, text: 'Step 2', done: false, created_at: '2026-06-01T09:01:00' },
  { id: 3, assignment_id: 10, text: 'Step 3', done: false, created_at: '2026-06-01T09:02:00' },
]

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  createTodo: vi.fn(async () => ({ id: 4, assignment_id: 10, text: 'Step 4', done: false, created_at: '' })),
  updateTodo: vi.fn(async () => mockTodos[0]),
  deleteTodo: vi.fn(async () => {}),
}))

describe('AssignmentChecklist', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders progress, sorts incomplete items to top and completed to bottom', () => {
    render(<AssignmentChecklist assignmentId={10} todos={mockTodos} onChanged={() => {}} />)

    // Progress text & bar
    expect(screen.getByText('1 of 3 done')).not.toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).not.toBeNull()

    // Order: Step 2, Step 3, Step 1 (Step 1 is done, so at bottom)
    const labels = screen.getAllByText(/Step \d/).map((el) => el.textContent)
    expect(labels).toEqual(['Step 2', 'Step 3', 'Step 1'])
  })

  it('toggles collapse state and persists to localStorage', () => {
    render(<AssignmentChecklist assignmentId={10} todos={mockTodos} onChanged={() => {}} />)

    const toggle = screen.getByRole('button', { name: /^Checklist$/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Step 2')).not.toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('studybook.checklist.collapsed')).toBe('true')

    // Progress bar and header remain visible when collapsed
    expect(screen.getByText('1 of 3 done')).not.toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).not.toBeNull()
  })

  it('initializes collapsed from localStorage', () => {
    localStorage.setItem('studybook.checklist.collapsed', 'true')

    render(<AssignmentChecklist assignmentId={10} todos={mockTodos} onChanged={() => {}} />)

    const toggle = screen.getByRole('button', { name: /^Checklist$/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})
