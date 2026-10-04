import { describe, expect, it } from 'vitest'

import { normalizeLayout, OVERVIEW_BOARD, OVERVIEW_LAYOUT_PRESETS } from '@/lib/dashboardLayout'
import { MODULE_BOARD, MODULE_DEFAULT_LAYOUT, MODULE_LAYOUT_PRESETS, moduleBoard } from '@/lib/moduleLayout'

describe('module layout presets', () => {
  it.each(MODULE_LAYOUT_PRESETS.map((p) => [p.label, p.layout] as const))('%s fits the board as drawn', (_label, layout) => {
    // normalizeLayout clamps to minimum sizes and scales down anything too tall: a preset that
    // survives unchanged is exactly what the user picked.
    expect(normalizeLayout(MODULE_BOARD, layout)).toEqual(layout)
  })

  it('has no two presets with the same layout', () => {
    const keys = MODULE_LAYOUT_PRESETS.map((p) => JSON.stringify(p.layout))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('moduleBoard', () => {
  it('uses the built-in layout when there is no user default', () => {
    expect(moduleBoard(null).defaultLayout).toEqual(MODULE_DEFAULT_LAYOUT)
  })

  it("uses the user's default for uncustomised modules and Reset", () => {
    const notes = MODULE_LAYOUT_PRESETS.find((p) => p.id === 'notes')!.layout
    expect(moduleBoard(notes).defaultLayout).toEqual(notes)
  })

  it('falls back to the built-in layout when the stored default is unusable', () => {
    expect(moduleBoard([{ i: 'nope', x: 0, y: 0, w: 1, h: 1 }]).defaultLayout).toEqual(MODULE_DEFAULT_LAYOUT)
  })
})

describe('overview layout presets', () => {
  it.each(OVERVIEW_LAYOUT_PRESETS.map((p) => [p.label, p.layout] as const))('%s fits the board as drawn', (_label, layout) => {
    expect(normalizeLayout(OVERVIEW_BOARD, layout)).toEqual(layout)
  })
})
