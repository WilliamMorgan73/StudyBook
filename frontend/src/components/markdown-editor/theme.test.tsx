// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ColumnsBlockView } from '@/components/ColumnsBlockView'

import { EDITOR_THEME_SPEC } from './theme'

// CodeMirror measures lines and block widgets by their border boxes, so any vertical margin is
// height its height map never sees: clicks and Up/Down then land on lines further down the more
// such blocks sit above (four lines off after a few code blocks). Layout can't be measured in
// jsdom, so this guards the pattern instead: no vertical margins in the editor theme.
function verticalMargins(rules: Record<string, unknown>): string[] {
  const found: string[] = []
  for (const [selector, value] of Object.entries(rules)) {
    if (!value || typeof value !== 'object') continue
    const style = value as Record<string, unknown>
    for (const prop of ['marginTop', 'marginBottom', 'marginBlock']) {
      if (style[prop] !== undefined && String(style[prop]) !== '0') found.push(`${selector} ${prop}: ${style[prop]}`)
    }
    if (typeof style.margin === 'string') {
      // margin: <all> | <vertical> <horizontal> | <top> <horizontal> <bottom> | <top> <right> <bottom> <left>
      const parts = style.margin.trim().split(/\s+(?![^(]*\))/)
      const vertical = parts.length >= 3 ? [parts[0], parts[2]] : [parts[0]]
      if (vertical.some((part) => part !== '0' && part !== '0px')) found.push(`${selector} margin: ${style.margin}`)
    }
    found.push(...verticalMargins(style))
  }
  return found
}

describe('editor layout', () => {
  it('has no vertical margins in the editor theme', () => {
    expect(verticalMargins(EDITOR_THEME_SPEC)).toEqual([])
  })

  it('spaces the side box with padding, not margin', () => {
    const { container } = render(<ColumnsBlockView main="a" sideTitle="" side="b" />)
    expect(container.firstElementChild!.className).not.toMatch(/(^|\s)m[ytb]-/)
  })
})
