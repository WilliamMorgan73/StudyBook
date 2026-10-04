// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WidgetError } from './WidgetError'

describe('WidgetError', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders message and optional retry button', () => {
    const onRetry = vi.fn()
    render(<WidgetError message="Failed to load items" onRetry={onRetry} />)

    expect(screen.getByText('Failed to load items')).not.toBeNull()
    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders message without retry button when onRetry is omitted', () => {
    render(<WidgetError message="Failed to load items" />)

    expect(screen.getByText('Failed to load items')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Retry/i })).toBeNull()
  })
})
