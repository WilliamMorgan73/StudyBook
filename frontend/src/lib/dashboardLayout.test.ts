import { describe, expect, it } from 'vitest'

import {
  addWidget,
  DASHBOARD_COLUMNS,
  DEFAULT_LAYOUT,
  hiddenWidgets,
  normalizeLayout,
  removeWidget,
  sameLayout,
  stackedOrder,
  WIDGET_IDS,
  WIDGETS,
  type LayoutItem,
} from '@/lib/dashboardLayout'

describe('DEFAULT_LAYOUT', () => {
  it('fits the grid and respects every minimum size', () => {
    for (const item of DEFAULT_LAYOUT) {
      expect(item.x + item.w).toBeLessThanOrEqual(DASHBOARD_COLUMNS)
      expect(item.w).toBeGreaterThanOrEqual(WIDGETS[item.i].minW)
      expect(item.h).toBeGreaterThanOrEqual(WIDGETS[item.i].minH)
    }
  })

  it('survives normalizing unchanged', () => {
    expect(normalizeLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT)
  })
})

describe('normalizeLayout', () => {
  it('falls back to the default for null, non-arrays and empty layouts', () => {
    expect(normalizeLayout(null)).toBe(DEFAULT_LAYOUT)
    expect(normalizeLayout({ calendar: 1 })).toBe(DEFAULT_LAYOUT)
    expect(normalizeLayout([])).toBe(DEFAULT_LAYOUT)
  })

  it('drops unknown ids, duplicates and malformed items', () => {
    const layout = normalizeLayout([
      { i: 'calendar', x: 0, y: 0, w: 6, h: 9 },
      { i: 'calendar', x: 6, y: 0, w: 6, h: 9 },
      { i: 'weather', x: 0, y: 9, w: 4, h: 4 },
      { i: 'notepad', x: 0, y: 9, w: '4', h: 4 },
      { i: 'toString', x: 0, y: 9, w: 4, h: 4 },
      'modules',
      null,
    ])

    expect(layout).toEqual([{ i: 'calendar', x: 0, y: 0, w: 6, h: 9 }])
  })

  it('falls back to the default when nothing usable is left', () => {
    expect(normalizeLayout([{ i: 'weather', x: 0, y: 0, w: 4, h: 4 }])).toBe(DEFAULT_LAYOUT)
  })

  it('clamps sizes to the widget minimum and the grid width', () => {
    const [small, wide, offGrid] = normalizeLayout([
      { i: 'calendar', x: 0, y: 0, w: 1, h: 1 },
      { i: 'modules', x: 0, y: 10, w: 40, h: 6 },
      { i: 'notepad', x: 11, y: -3, w: 4, h: 6 },
    ])

    expect(small).toEqual({ i: 'calendar', x: 0, y: 0, w: WIDGETS.calendar.minW, h: WIDGETS.calendar.minH })
    expect(wide).toEqual({ i: 'modules', x: 0, y: 10, w: 12, h: 6 })
    expect(offGrid).toEqual({ i: 'notepad', x: 8, y: 0, w: 4, h: 6 })
  })
})

describe('adding and removing widgets', () => {
  const layout: LayoutItem[] = [
    { i: 'calendar', x: 0, y: 0, w: 8, h: 10 },
    { i: 'notepad', x: 8, y: 0, w: 4, h: 14 },
  ]

  it('lists only the widgets that are not placed, in registry order', () => {
    expect(hiddenWidgets(layout)).toEqual(WIDGET_IDS.filter((id) => id !== 'calendar' && id !== 'notepad'))
  })

  it('adds a widget at its default size below everything else', () => {
    expect(addWidget(layout, 'flashcardsDue').at(-1)).toEqual({
      i: 'flashcardsDue',
      x: 0,
      y: 14,
      w: WIDGETS.flashcardsDue.defaultW,
      h: WIDGETS.flashcardsDue.defaultH,
    })
  })

  it('does not add a widget twice', () => {
    expect(addWidget(layout, 'calendar')).toBe(layout)
  })

  it('places the first widget of an empty layout at the top', () => {
    expect(addWidget([], 'todo')[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('removes a widget', () => {
    expect(removeWidget(layout, 'calendar')).toEqual([layout[1]])
  })
})

describe('stackedOrder', () => {
  it('reads top to bottom, then left to right', () => {
    const order = stackedOrder([
      { i: 'modules', x: 0, y: 13, w: 12, h: 6 },
      { i: 'progress', x: 9, y: 0, w: 3, h: 7 },
      { i: 'calendar', x: 0, y: 0, w: 6, h: 9 },
    ]).map((item) => item.i)

    expect(order).toEqual(['calendar', 'progress', 'modules'])
  })
})

describe('sameLayout', () => {
  it('ignores order but not position', () => {
    const reversed = [...DEFAULT_LAYOUT].reverse()
    expect(sameLayout(DEFAULT_LAYOUT, reversed)).toBe(true)

    const moved = DEFAULT_LAYOUT.map((item) => (item.i === 'todo' ? { ...item, y: item.y + 1 } : item))
    expect(sameLayout(DEFAULT_LAYOUT, moved)).toBe(false)
    expect(sameLayout(DEFAULT_LAYOUT, DEFAULT_LAYOUT.slice(1))).toBe(false)
  })
})
