// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQuickTodo, listQuickTodos, type ModuleSummary, type QuickTodo } from '@/lib/api'

import { QuickTodoList } from './QuickTodoList'

const todo = (id: number, text: string, module_id: number | null): QuickTodo => ({
  id,
  text,
  done: false,
  module_id,
  created_at: '2026-10-01T09:00:00',
})

const TODOS = [todo(1, 'Buy milk', null), todo(2, 'Revise trees', 5), todo(3, 'Email tutor', 7)]

const module = (id: number, name: string) => ({ id, name, color: '#6366f1' }) as ModuleSummary
const MODULES = [module(5, 'Algorithms'), module(7, 'Databases')]

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  listQuickTodos: vi.fn(async () => TODOS),
  createQuickTodo: vi.fn(async () => TODOS[0]),
}))

function renderList(props: Parameters<typeof QuickTodoList>[0]) {
  return render(
    <MemoryRouter>
      <QuickTodoList {...props} />
    </MemoryRouter>,
  )
}

describe('QuickTodoList', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("groups the Overview's to-dos under General and each module", async () => {
    renderList({ modules: MODULES })

    await screen.findByText('Buy milk')
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['General', 'Algorithms', 'Databases'])
    expect(screen.getByRole('button', { name: 'Filter to-dos' })).not.toBeNull()
  })

  it('leaves out the categories the filter hides', async () => {
    localStorage.setItem('studybook.todoFilter.hidden', JSON.stringify(['general', 7]))
    renderList({ modules: MODULES })

    await screen.findByText('Revise trees')
    expect(screen.queryByText('Buy milk')).toBeNull()
    expect(screen.queryByText('Email tutor')).toBeNull()
  })

  it("on a module page, lists and adds only that module's to-dos, with no filter", async () => {
    vi.mocked(listQuickTodos).mockResolvedValueOnce([TODOS[1]])
    renderList({ moduleId: 5 })

    await screen.findByText('Revise trees')
    expect(listQuickTodos).toHaveBeenCalledWith({ moduleId: 5 })
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Filter to-dos' })).toBeNull()

    const input = screen.getByPlaceholderText('Add a to-do…')
    fireEvent.change(input, { target: { value: 'Read chapter 4' } })
    fireEvent.submit(input.closest('form')!)
    expect(createQuickTodo).toHaveBeenCalledWith('Read chapter 4', 5)
  })
})
