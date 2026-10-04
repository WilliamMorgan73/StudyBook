import { describe, expect, it } from 'vitest'

import {
  addWidget,
  canAddWidget,
  DASHBOARD_COLUMNS,
  DASHBOARD_MARGIN,
  DASHBOARD_MIN_ROW_HEIGHT,
  DASHBOARD_ROWS,
  DEFAULT_LAYOUT,
  fitRowHeight,
  layoutBottom,
  hiddenWidgets,
  normalizeLayout,
  removeWidget,
  sameLayout,
  stackedOrder,
  OVERVIEW_BOARD,
  WIDGET_IDS,
  WIDGETS,
  type Board,
  type LayoutItem,
  type WidgetId,
} from '@/lib/dashboardLayout'
import { MODULE_BOARD } from '@/lib/moduleLayout'

describe.each<[string, Board<string>]>([
  ['the Overview', OVERVIEW_BOARD],
  ['a module page', MODULE_BOARD],
])("%s's default layout", (_name, board) => {
  it('fills the board exactly and respects every minimum size', () => {
    expect(layoutBottom(board.defaultLayout)).toBe(DASHBOARD_ROWS)
    for (const item of board.defaultLayout) {
      expect(item.x + item.w).toBeLessThanOrEqual(DASHBOARD_COLUMNS)
      expect(item.w).toBeGreaterThanOrEqual(board.widgets[item.i].minW)
      expect(item.h).toBeGreaterThanOrEqual(board.widgets[item.i].minH)
    }
  })

  it('survives normalizing unchanged', () => {
    expect(normalizeLayout(board, board.defaultLayout)).toEqual(board.defaultLayout)
  })
})

describe('normalizeLayout', () => {
  it('falls back to the default for null, non-arrays and empty layouts', () => {
    expect(normalizeLayout(OVERVIEW_BOARD, null)).toBe(DEFAULT_LAYOUT)
    expect(normalizeLayout(OVERVIEW_BOARD, { calendar: 1 })).toBe(DEFAULT_LAYOUT)
    expect(normalizeLayout(OVERVIEW_BOARD, [])).toBe(DEFAULT_LAYOUT)
  })

  it('drops unknown ids, duplicates and malformed items', () => {
    const layout = normalizeLayout(OVERVIEW_BOARD, [
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

  it("drops another board's widgets", () => {
    expect(normalizeLayout(MODULE_BOARD, [{ i: 'calendar', x: 0, y: 0, w: 6, h: 9 }])).toBe(MODULE_BOARD.defaultLayout)
  })

  it('falls back to the default when nothing usable is left', () => {
    expect(normalizeLayout(OVERVIEW_BOARD, [{ i: 'weather', x: 0, y: 0, w: 4, h: 4 }])).toBe(DEFAULT_LAYOUT)
  })

  it('clamps sizes to the widget minimum and the grid width', () => {
    const [small, wide, offGrid] = normalizeLayout(OVERVIEW_BOARD, [
      { i: 'calendar', x: 0, y: 0, w: 1, h: 1 },
      { i: 'modules', x: 0, y: 8, w: 40, h: 6 },
      { i: 'notepad', x: 11, y: -3, w: 4, h: 6 },
    ])

    expect(small).toEqual({ i: 'calendar', x: 0, y: 0, w: WIDGETS.calendar.minW, h: WIDGETS.calendar.minH })
    expect(wide).toEqual({ i: 'modules', x: 0, y: 8, w: 12, h: 6 })
    expect(offGrid).toEqual({ i: 'notepad', x: 8, y: 0, w: 4, h: 6 })
  })

  it('scales a layout taller than the board down onto it', () => {
    const layout = normalizeLayout(OVERVIEW_BOARD, [
      { i: 'calendar', x: 0, y: 0, w: 6, h: 9 },
      { i: 'agenda', x: 0, y: 9, w: 6, h: 4 },
      { i: 'progress', x: 6, y: 0, w: 6, h: 13 },
      { i: 'modules', x: 0, y: 13, w: 12, h: 6 },
    ])

    expect(layoutBottom(layout)).toBeLessThanOrEqual(DASHBOARD_ROWS)
    for (const item of layout) expect(item.h).toBeGreaterThanOrEqual(WIDGETS[item.i].minH)
    expect(stackedOrder(layout).map((item) => item.i)).toEqual(['calendar', 'progress', 'agenda', 'modules'])
  })
})

describe('adding and removing widgets', () => {
  const layout: LayoutItem<WidgetId>[] = [
    { i: 'calendar', x: 0, y: 0, w: 8, h: 10 },
    { i: 'notepad', x: 8, y: 0, w: 4, h: 14 },
  ]

  it('lists only the widgets that are not placed, in registry order', () => {
    expect(hiddenWidgets(OVERVIEW_BOARD, layout)).toEqual(WIDGET_IDS.filter((id) => id !== 'calendar' && id !== 'notepad'))
  })

  it('adds a widget at its default size in the first free space on the board', () => {
    const partial: LayoutItem<WidgetId>[] = [{ i: 'calendar', x: 0, y: 0, w: 8, h: 10 }]
    expect(addWidget(OVERVIEW_BOARD, partial, 'flashcardsDue').at(-1)).toEqual({
      i: 'flashcardsDue',
      x: 8,
      y: 0,
      w: WIDGETS.flashcardsDue.defaultW,
      h: WIDGETS.flashcardsDue.defaultH,
    })
  })

  it('shrinks a widget towards its minimum size to fit the space left', () => {
    // Four rows free under the calendar, but the modules widget defaults to the full width.
    expect(addWidget(OVERVIEW_BOARD, layout, 'modules').at(-1)).toEqual({ i: 'modules', x: 0, y: 10, w: 8, h: 4 })
  })

  it('leaves the layout alone when there is no room, even at the minimum size', () => {
    const full: LayoutItem<WidgetId>[] = [{ i: 'notepad', x: 0, y: 0, w: 12, h: DASHBOARD_ROWS }]
    expect(canAddWidget(OVERVIEW_BOARD, full, 'todo')).toBe(false)
    expect(addWidget(OVERVIEW_BOARD, full, 'todo')).toBe(full)
    expect(canAddWidget(OVERVIEW_BOARD, layout, 'todo')).toBe(true)
  })

  it('does not add a widget twice', () => {
    expect(addWidget(OVERVIEW_BOARD, layout, 'calendar')).toBe(layout)
  })

  it('places the first widget of an empty layout at the top', () => {
    expect(addWidget(OVERVIEW_BOARD, [], 'todo')[0]).toMatchObject({ x: 0, y: 0 })
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

describe('fitRowHeight', () => {
  it('fills the board to within a pixel per row without overflowing, padding and gaps included', () => {
    const used = DASHBOARD_ROWS * fitRowHeight(1000) + (DASHBOARD_ROWS + 1) * DASHBOARD_MARGIN
    expect(used).toBeLessThanOrEqual(1000)
    expect(used).toBeGreaterThan(1000 - DASHBOARD_ROWS)
  })

  it('stops shrinking at the minimum row height', () => {
    expect(fitRowHeight(200)).toBe(DASHBOARD_MIN_ROW_HEIGHT)
  })
})
