// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders title, description, and badge', () => {
    render(
      <MemoryRouter>
        <ErrorState
          icon={AlertCircle}
          badge="404"
          title="Not Found"
          description="The requested item could not be found."
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('404')).not.toBeNull()
    expect(screen.getByText('Not Found')).not.toBeNull()
    expect(screen.getByText('The requested item could not be found.')).not.toBeNull()
  })

  it('renders action buttons and triggers callbacks', () => {
    const onRetry = vi.fn()
    render(
      <MemoryRouter>
        <ErrorState
          icon={AlertCircle}
          title="Error"
          primaryAction={{ label: 'Back', to: '/', icon: ArrowLeft }}
          secondaryAction={{ label: 'Retry', onClick: onRetry }}
        />
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: /Back/i })
    expect(link.getAttribute('href')).toBe('/')
    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders code snippet and copies to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText },
    })

    render(
      <MemoryRouter>
        <ErrorState
          icon={AlertCircle}
          title="Server offline"
          codeSnippet="uv run uvicorn app.main:app"
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('uv run uvicorn app.main:app')).not.toBeNull()
    const copyButton = screen.getByTitle('Copy command')
    fireEvent.click(copyButton)
    expect(writeText).toHaveBeenCalledWith('uv run uvicorn app.main:app')
  })
})
