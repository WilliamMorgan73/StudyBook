// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders 404 badge, title, and link back to overview', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('404')).not.toBeNull()
    expect(screen.getByText('Page not found')).not.toBeNull()
    const link = screen.getByRole('link', { name: /Back to Overview/i })
    expect(link.getAttribute('href')).toBe('/')
  })
})
