import { describe, expect, it } from 'vitest'

import { formatTokenEstimate, toggleRawPdf } from './aiSource'

describe('formatTokenEstimate', () => {
  it('shows small counts exactly and large ones in thousands', () => {
    expect(formatTokenEstimate(240)).toBe('~240 tokens')
    expect(formatTokenEstimate(1000)).toBe('~1k tokens')
    expect(formatTokenEstimate(1250)).toBe('~1.3k tokens')
    expect(formatTokenEstimate(48_600)).toBe('~49k tokens')
  })
})

describe('toggleRawPdf', () => {
  it('adds and removes ids, sorted and without duplicates', () => {
    expect(toggleRawPdf([4], 2, true)).toEqual([2, 4])
    expect(toggleRawPdf([2, 4], 2, true)).toEqual([2, 4])
    expect(toggleRawPdf([2, 4], 4, false)).toEqual([2])
  })
})
