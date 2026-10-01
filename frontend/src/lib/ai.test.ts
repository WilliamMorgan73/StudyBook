import { describe, expect, it } from 'vitest'

import { aiErrorMessage } from './ai'
import { ApiError } from './api'

describe('aiErrorMessage', () => {
  it("passes through the backend's readable message for AI failures", () => {
    const error = new ApiError('Anthropic rejected the API key. Check it in Settings → AI Integration.', 502, 'auth')
    expect(aiErrorMessage(error)).toBe('Anthropic rejected the API key. Check it in Settings → AI Integration.')
  })

  it('explains when the backend itself is unreachable', () => {
    expect(aiErrorMessage(new TypeError('Failed to fetch'))).toMatch(/StudyBook backend/)
  })

  it('falls back to a generic message for unknown values', () => {
    expect(aiErrorMessage('boom')).toBe('The AI request failed. Try again.')
    expect(aiErrorMessage(new Error('Specific failure'))).toBe('Specific failure')
  })
})
