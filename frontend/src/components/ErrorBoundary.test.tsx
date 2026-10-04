// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function BrokenComponent(): ReactNode {
  throw new Error('Test crash')
}

function WorkingComponent() {
  return <div>Everything is fine</div>
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Everything is fine')).not.toBeNull()
  })

  it('renders fallback error screen when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).not.toBeNull()
    expect(screen.getByText('Application Error')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Reload page/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /Go to Overview/i })).not.toBeNull()

    consoleError.mockRestore()
  })
})
