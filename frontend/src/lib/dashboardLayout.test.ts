import { describe, expect, it } from 'vitest'

import {
  addableWidgets,
  addWidget,
  canAddWidget,
  cellAt,
  edgeStep,
  configureWidget,
  DASHBOARD_COLUMNS,
  DASHBOARD_MARGIN,
  DASHBOARD_MIN_ROW_HEIGHT,
  DASHBOARD_ROWS,
  DEFAULT_LAYOUT,
  fitRowHeight,
  layoutBottom,
  neighbourInDirection,
  nudgeTile,
  normalizeLayout,
  removeWidget,
  resizeTile,
  sameLayout,
  stackedOrder,
  swapTiles,
  tileAt,
  OVERVIEW_BOARD,
  WIDGET_IDS,
  WIDGETS,
  type Board,
  type Direction,
  type LayoutItem,
  type Tile,
  type WidgetId,
  type WidgetInfo,
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
      expect(item.w).toBeGreaterThanOrEqual(board.widgets[item.type].minW)
      expect(item.h).toBeGreaterThanOrEqual(board.widgets[item.type].minH)
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

    expect(layout).toEqual([{ i: 'calendar', type: 'calendar', x: 0, y: 0, w: 6, h: 9 }])
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

    expect(small).toEqual({ i: 'calendar', type: 'calendar', x: 0, y: 0, w: WIDGETS.calendar.minW, h: WIDGETS.calendar.minH })
    expect(wide).toEqual({ i: 'modules', type: 'modules', x: 0, y: 8, w: 12, h: 6 })
    expect(offGrid).toEqual({ i: 'notepad', type: 'notepad', x: 8, y: 0, w: 4, h: 6 })
  })

  it('scales a layout taller than the board down onto it', () => {
    const layout = normalizeLayout(OVERVIEW_BOARD, [
      { i: 'calendar', x: 0, y: 0, w: 6, h: 9 },
      { i: 'agenda', x: 0, y: 9, w: 6, h: 4 },
      { i: 'progress', x: 6, y: 0, w: 6, h: 13 },
      { i: 'modules', x: 0, y: 13, w: 12, h: 6 },
    ])

    expect(layoutBottom(layout)).toBeLessThanOrEqual(DASHBOARD_ROWS)
    for (const item of layout) expect(item.h).toBeGreaterThanOrEqual(WIDGETS[item.type].minH)
    expect(stackedOrder(layout).map((item) => item.i)).toEqual(['calendar', 'progress', 'agenda', 'modules'])
  })
})

describe('widget copies and settings', () => {
  // A board with a clock that can be placed more than once, each copy with its own time zone.
  const clockConfig = {
    normalize: (raw: unknown) => {
      const zone = (raw as { zone?: unknown } | null)?.zone
      return { zone: typeof zone === 'string' ? zone : 'local' }
    },
  }
  const info = (extra: Partial<WidgetInfo> = {}): WidgetInfo => ({
    title: '',
    description: '',
    minW: 2,
    minH: 2,
    defaultW: 3,
    defaultH: 3,
    ...extra,
  })
  const board: Board<'clock' | 'notes'> = {
    widgets: { clock: info({ multiple: true, config: clockConfig }), notes: info() },
    defaultLayout: [{ i: 'notes', type: 'notes', x: 0, y: 0, w: 3, h: 3 }],
  }

  it('reads a layout saved before copies existed as the widget its id names', () => {
    expect(normalizeLayout(board, [{ i: 'notes', x: 0, y: 0, w: 3, h: 3 }])).toEqual([
      { i: 'notes', type: 'notes', x: 0, y: 0, w: 3, h: 3 },
    ])
  })

  it('keeps every copy of a widget that can be placed more than once, each with its own settings', () => {
    const layout = normalizeLayout(board, [
      { i: 'clock', type: 'clock', config: { zone: 'Europe/London' }, x: 0, y: 0, w: 3, h: 3 },
      { i: 'clock-2', type: 'clock', config: { zone: 'Asia/Tokyo' }, x: 3, y: 0, w: 3, h: 3 },
    ])
    expect(layout.map((item) => [item.i, item.config])).toEqual([
      ['clock', { zone: 'Europe/London' }],
      ['clock-2', { zone: 'Asia/Tokyo' }],
    ])
  })

  it('drops duplicate instance ids, unknown types, and second copies of single widgets', () => {
    const layout = normalizeLayout(board, [
      { i: 'clock', type: 'clock', x: 0, y: 0, w: 3, h: 3 },
      { i: 'clock', type: 'clock', x: 3, y: 0, w: 3, h: 3 },
      { i: 'notes', type: 'notes', x: 6, y: 0, w: 3, h: 3 },
      { i: 'notes-2', type: 'notes', x: 9, y: 0, w: 3, h: 3 },
      { i: 'weather', type: 'weather', x: 0, y: 3, w: 3, h: 3 },
      { i: 'clock-3', type: 'toString', x: 0, y: 3, w: 3, h: 3 },
      { i: '', type: 'clock', x: 0, y: 3, w: 3, h: 3 },
      { i: 'x'.repeat(33), type: 'clock', x: 0, y: 3, w: 3, h: 3 },
    ])
    expect(layout.map((item) => item.i)).toEqual(['clock', 'notes'])
  })

  it("fills in invalid or missing settings, and gives widgets without settings none", () => {
    const [missing, invalid, plain] = normalizeLayout(board, [
      { i: 'clock', type: 'clock', x: 0, y: 0, w: 3, h: 3 },
      { i: 'clock-2', type: 'clock', config: { zone: 42 }, x: 3, y: 0, w: 3, h: 3 },
      { i: 'notes', type: 'notes', config: { zone: 'Asia/Tokyo' }, x: 6, y: 0, w: 3, h: 3 },
    ])
    expect(missing.config).toEqual({ zone: 'local' })
    expect(invalid.config).toEqual({ zone: 'local' })
    expect(plain).not.toHaveProperty('config')
  })

  it('adds another copy with a fresh id and default settings, and still offers it', () => {
    const one = addWidget(board, [], 'clock')
    const two = addWidget(board, one, 'clock')
    const three = addWidget(board, removeWidget(addWidget(board, two, 'clock'), 'clock-2'), 'clock')
    expect(two.map((item) => item.i)).toEqual(['clock', 'clock-2'])
    expect(two[1]).toMatchObject({ type: 'clock', config: { zone: 'local' } })
    expect(three.map((item) => item.i)).toEqual(['clock', 'clock-3', 'clock-2'])
    expect(addableWidgets(board, two)).toEqual(['clock', 'notes'])
  })

  it('changes one copy\'s settings, which counts as a different layout', () => {
    const two = addWidget(board, addWidget(board, [], 'clock'), 'clock')
    const changed = configureWidget(two, 'clock-2', { zone: 'Asia/Tokyo' })
    expect(changed.map((item) => item.config)).toEqual([{ zone: 'local' }, { zone: 'Asia/Tokyo' }])
    expect(sameLayout(two, changed)).toBe(false)
    expect(sameLayout(changed, normalizeLayout(board, JSON.parse(JSON.stringify(changed))))).toBe(true)
  })

  it.each<[string, Board<string>]>([
    ['the Overview', OVERVIEW_BOARD],
    ['a module page', MODULE_BOARD],
  ])('keeps two real clocks with different settings on %s', (_name, real) => {
    const tokyo = { style: 'digital', timeZone: 'Asia/Tokyo', label: 'Home', showDate: true, showSeconds: false, hour12: false }
    const analog = { style: 'analog', timeZone: null, label: '', showDate: false, showSeconds: true, hour12: true }
    const layout = [
      { i: 'clock', type: 'clock', config: tokyo, x: 0, y: 0, w: 3, h: 3 },
      { i: 'clock-2', type: 'clock', config: analog, x: 3, y: 0, w: 3, h: 3 },
    ]
    const saved = normalizeLayout(real, JSON.parse(JSON.stringify(layout)))
    expect(saved).toEqual(layout)
    expect(addableWidgets(real, saved)).toContain('clock')
  })
})

describe('adding and removing widgets', () => {
  const layout: LayoutItem<WidgetId>[] = [
    { i: 'calendar', type: 'calendar', x: 0, y: 0, w: 8, h: 10 },
    { i: 'notepad', type: 'notepad', x: 8, y: 0, w: 4, h: 14 },
  ]

  it('offers only the widgets that are not placed, in registry order', () => {
    expect(addableWidgets(OVERVIEW_BOARD, layout)).toEqual(WIDGET_IDS.filter((id) => id !== 'calendar' && id !== 'notepad'))
  })

  it('adds a widget at its default size in the first free space on the board', () => {
    const partial: LayoutItem<WidgetId>[] = [{ i: 'calendar', type: 'calendar', x: 0, y: 0, w: 8, h: 10 }]
    expect(addWidget(OVERVIEW_BOARD, partial, 'flashcardsDue').at(-1)).toEqual({
      i: 'flashcardsDue',
      type: 'flashcardsDue',
      x: 8,
      y: 0,
      w: WIDGETS.flashcardsDue.defaultW,
      h: WIDGETS.flashcardsDue.defaultH,
    })
  })

  it('shrinks a widget towards its minimum size to fit the space left', () => {
    // Four rows free under the calendar, but the modules widget defaults to the full width.
    expect(addWidget(OVERVIEW_BOARD, layout, 'modules').at(-1)).toEqual({ i: 'modules', type: 'modules', x: 0, y: 10, w: 8, h: 4 })
  })

  it('leaves the layout alone when there is no room, even at the minimum size', () => {
    const full: LayoutItem<WidgetId>[] = [{ i: 'notepad', type: 'notepad', x: 0, y: 0, w: 12, h: DASHBOARD_ROWS }]
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

describe('swapTiles', () => {
  it('trades the places of two widgets of the same size', () => {
    const swapped = swapTiles(DEFAULT_LAYOUT, 'upcoming', 'notepad')
    const expected = DEFAULT_LAYOUT.map((item) =>
      item.i === 'upcoming' ? { ...item, x: 9, y: 5 } : item.i === 'notepad' ? { ...item, x: 6, y: 0 } : item,
    )
    expect(swapped && sameLayout(swapped, expected)).toBe(true)
  })

  it('keeps each size when the sizes differ, compacting whatever they now overlap', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 4, h: 4 },
      { i: 'b', x: 4, y: 0, w: 4, h: 6 },
      { i: 'c', x: 0, y: 4, w: 4, h: 4 },
    ]
    const swapped = swapTiles(layout, 'a', 'b')
    expect(
      swapped &&
        sameLayout(swapped, [
          { i: 'b', x: 0, y: 0, w: 4, h: 6 },
          { i: 'a', x: 4, y: 0, w: 4, h: 4 },
          { i: 'c', x: 0, y: 6, w: 4, h: 4 },
        ]),
    ).toBe(true)
  })

  it('pulls a widget too wide for the other column back onto the board', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 8, h: 4 },
      { i: 'b', x: 10, y: 0, w: 2, h: 4 },
    ]
    expect(swapTiles(layout, 'a', 'b')).toEqual(
      expect.arrayContaining([
        { i: 'a', x: 4, y: 0, w: 8, h: 4 },
        { i: 'b', x: 0, y: 0, w: 2, h: 4 },
      ]),
    )
  })

  it('refuses a swap that would push a widget off the bottom of the board', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 6, h: DASHBOARD_ROWS },
      { i: 'b', x: 6, y: 0, w: 6, h: 7 },
      { i: 'c', x: 6, y: 7, w: 6, h: 7 },
    ]
    expect(swapTiles(layout, 'a', 'b')).toBeNull()
  })

  it('refuses unknown widgets and swapping a widget with itself', () => {
    expect(swapTiles(DEFAULT_LAYOUT, 'calendar', 'calendar')).toBeNull()
    expect(swapTiles(DEFAULT_LAYOUT, 'calendar', 'flashcardsDue')).toBeNull()
  })
})

describe('cellAt and tileAt', () => {
  // Columns 50px wide and rows 30px tall, with the margin around and between them.
  const width = DASHBOARD_MARGIN * (DASHBOARD_COLUMNS + 1) + 50 * DASHBOARD_COLUMNS
  const rowHeight = 30

  it('finds the cell under a point, counting a gap as the cell before it', () => {
    expect(cellAt(DASHBOARD_MARGIN, DASHBOARD_MARGIN, width, rowHeight)).toEqual({ col: 0, row: 0 })
    expect(cellAt(DASHBOARD_MARGIN + 50 + 5, DASHBOARD_MARGIN + 30 + 5, width, rowHeight)).toEqual({ col: 0, row: 0 })
    expect(cellAt(DASHBOARD_MARGIN + 50 + DASHBOARD_MARGIN, DASHBOARD_MARGIN + 30 + DASHBOARD_MARGIN, width, rowHeight)).toEqual({
      col: 1,
      row: 1,
    })
  })

  it('snaps points outside the board to its nearest cell', () => {
    expect(cellAt(-20, -20, width, rowHeight)).toEqual({ col: 0, row: 0 })
    expect(cellAt(10_000, 10_000, width, rowHeight)).toEqual({ col: DASHBOARD_COLUMNS - 1, row: DASHBOARD_ROWS - 1 })
  })

  it('finds the widget covering a cell, other than the one being dragged', () => {
    expect(tileAt(DEFAULT_LAYOUT, 10, 6, 'calendar')).toBe('notepad')
    expect(tileAt(DEFAULT_LAYOUT, 0, 0, 'calendar')).toBeNull()
    expect(tileAt([{ i: 'todo', x: 0, y: 0, w: 3, h: 3 }], 5, 5, 'calendar')).toBeNull()
  })
})

describe('resizeTile', () => {
  const sized = (minW: number, minH: number): WidgetInfo => ({ title: '', description: '', minW, minH, defaultW: minW, defaultH: minH })
  const widgets: Record<string, WidgetInfo> = { a: sized(4, 4), b: sized(2, 3), c: sized(3, 3), d: sized(2, 3) }
  // Grows or shrinks widget a from its right and bottom edges, like the corner handle.
  const resized = (layout: Tile[], w: number, h: number) => {
    const { x, y } = layout.find((item) => item.i === 'a')!
    return resizeTile(widgets, layout, 'a', { x, y, w, h })
  }
  const expectLayout = (actual: Tile[] | null, expected: Tile[]) => {
    expect(actual).not.toBeNull()
    expect([...actual!].sort((x, y) => x.i.localeCompare(y.i))).toEqual(expected)
  }

  const sideBySide: Tile[] = [
    { i: 'a', x: 0, y: 0, w: 6, h: 7 },
    { i: 'b', x: 6, y: 0, w: 6, h: 7 },
  ]

  it('narrows the widget beside it when growing right, keeping its right edge', () => {
    expectLayout(resized(sideBySide, 8, 7), [
      { i: 'a', x: 0, y: 0, w: 8, h: 7 },
      { i: 'b', x: 8, y: 0, w: 4, h: 7 },
    ])
  })

  it('stops growing right once the widget beside it is at its minimum width', () => {
    expectLayout(resized(sideBySide, 12, 7), [
      { i: 'a', x: 0, y: 0, w: 10, h: 7 },
      { i: 'b', x: 10, y: 0, w: 2, h: 7 },
    ])
  })

  it('works from the layout at the start of the resize, so shrinking back restores the others', () => {
    expectLayout(resized(sideBySide, 6, 7), sideBySide)
    expectLayout(resized(sideBySide, 5, 7), [
      { i: 'a', x: 0, y: 0, w: 5, h: 7 },
      { i: 'b', x: 6, y: 0, w: 6, h: 7 },
    ])
  })

  it('narrows every widget it runs into by the same amount, stopping at the first minimum', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 6, h: 8 },
      { i: 'b', x: 6, y: 0, w: 6, h: 4 },
      { i: 'c', x: 6, y: 4, w: 6, h: 4 },
    ]
    expectLayout(resized(layout, 8, 8), [
      { i: 'a', x: 0, y: 0, w: 8, h: 8 },
      { i: 'b', x: 8, y: 0, w: 4, h: 4 },
      { i: 'c', x: 8, y: 4, w: 4, h: 4 },
    ])
    // c's minimum width (3) stops it before b's (2) would.
    expectLayout(resized(layout, 12, 8), [
      { i: 'a', x: 0, y: 0, w: 9, h: 8 },
      { i: 'b', x: 9, y: 0, w: 3, h: 4 },
      { i: 'c', x: 9, y: 4, w: 3, h: 4 },
    ])
  })

  it('grows into free space without touching anything', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 4, h: 4 },
      { i: 'b', x: 8, y: 0, w: 4, h: 4 },
    ]
    expectLayout(resized(layout, 8, 4), [
      { i: 'a', x: 0, y: 0, w: 8, h: 4 },
      { i: 'b', x: 8, y: 0, w: 4, h: 4 },
    ])
  })

  it('pushes the widgets below down when growing down and there is room', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 4, h: 4 },
      { i: 'b', x: 0, y: 4, w: 4, h: 4 },
    ]
    expectLayout(resized(layout, 4, 6), [
      { i: 'a', x: 0, y: 0, w: 4, h: 6 },
      { i: 'b', x: 0, y: 6, w: 4, h: 4 },
    ])
  })

  it('shortens the widgets below, keeping their bottom edges, when the board is full', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 4, h: 7 },
      { i: 'b', x: 0, y: 7, w: 4, h: 7 },
    ]
    expectLayout(resized(layout, 4, 9), [
      { i: 'a', x: 0, y: 0, w: 4, h: 9 },
      { i: 'b', x: 0, y: 9, w: 4, h: 5 },
    ])
    expectLayout(resized(layout, 4, DASHBOARD_ROWS), [
      { i: 'a', x: 0, y: 0, w: 4, h: 11 },
      { i: 'b', x: 0, y: 11, w: 4, h: 3 },
    ])
  })

  it('narrows the widget beside it and shortens the one below when growing from the corner', () => {
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 6, h: 7 },
      { i: 'b', x: 6, y: 0, w: 6, h: 14 },
      { i: 'c', x: 0, y: 7, w: 6, h: 7 },
    ]
    expectLayout(resized(layout, 8, 9), [
      { i: 'a', x: 0, y: 0, w: 8, h: 9 },
      { i: 'b', x: 8, y: 0, w: 4, h: 14 },
      { i: 'c', x: 0, y: 9, w: 6, h: 5 },
    ])
  })

  it("doesn't grow at all when the widgets beside it are already at their minimum width", () => {
    // Upcoming and To-do, beside the default Calendar, are 3 wide: their minimum.
    const out = resizeTile(WIDGETS, DEFAULT_LAYOUT, 'calendar', { x: 0, y: 0, w: 8, h: 7 })
    expect(out && sameLayout(out, DEFAULT_LAYOUT)).toBe(true)
  })

  it('narrows the widget to its left when growing left, keeping its left edge', () => {
    const layout: Tile[] = [
      { i: 'b', x: 0, y: 0, w: 6, h: 7 },
      { i: 'a', x: 6, y: 0, w: 6, h: 7 },
    ]
    expectLayout(resizeTile(widgets, layout, 'a', { x: 4, y: 0, w: 8, h: 7 }), [
      { i: 'a', x: 4, y: 0, w: 8, h: 7 },
      { i: 'b', x: 0, y: 0, w: 4, h: 7 },
    ])
    // b stops at its minimum width, 2, and the right edge stays put.
    expectLayout(resizeTile(widgets, layout, 'a', { x: 0, y: 0, w: 12, h: 7 }), [
      { i: 'a', x: 2, y: 0, w: 10, h: 7 },
      { i: 'b', x: 0, y: 0, w: 2, h: 7 },
    ])
    // Shrinking from the left leaves b alone.
    expectLayout(resizeTile(widgets, layout, 'a', { x: 7, y: 0, w: 5, h: 7 }), [
      { i: 'a', x: 7, y: 0, w: 5, h: 7 },
      { i: 'b', x: 0, y: 0, w: 6, h: 7 },
    ])
  })

  it('shortens the widget above when growing up, keeping its top', () => {
    const layout: Tile[] = [
      { i: 'b', x: 0, y: 0, w: 6, h: 7 },
      { i: 'a', x: 0, y: 7, w: 6, h: 7 },
    ]
    expectLayout(resizeTile(widgets, layout, 'a', { x: 0, y: 5, w: 6, h: 9 }), [
      { i: 'a', x: 0, y: 5, w: 6, h: 9 },
      { i: 'b', x: 0, y: 0, w: 6, h: 5 },
    ])
    expectLayout(resizeTile(widgets, layout, 'a', { x: 0, y: 0, w: 6, h: DASHBOARD_ROWS }), [
      { i: 'a', x: 0, y: 3, w: 6, h: 11 },
      { i: 'b', x: 0, y: 0, w: 6, h: 3 },
    ])
  })

  it('squeezes the widgets to the left and above when growing from the top-left corner', () => {
    const layout: Tile[] = [
      { i: 'b', x: 0, y: 0, w: 6, h: 7 },
      { i: 'c', x: 6, y: 0, w: 6, h: 7 },
      { i: 'd', x: 0, y: 7, w: 6, h: 7 },
      { i: 'a', x: 6, y: 7, w: 6, h: 7 },
    ]
    // d narrows; b and c, both above the wider widget, get shorter, and d floats up under b.
    expectLayout(resizeTile(widgets, layout, 'a', { x: 4, y: 5, w: 8, h: 9 }), [
      { i: 'a', x: 4, y: 5, w: 8, h: 9 },
      { i: 'b', x: 0, y: 0, w: 6, h: 5 },
      { i: 'c', x: 6, y: 0, w: 6, h: 5 },
      { i: 'd', x: 0, y: 5, w: 4, h: 7 },
    ])
  })
})

describe('edgeStep (keyboard resize)', () => {
  const tile = { x: 4, y: 4, w: 4, h: 4 }

  it.each<[Direction, Omit<Tile, 'i'>, Omit<Tile, 'i'>]>([
    ['left', { x: 3, y: 4, w: 5, h: 4 }, { x: 5, y: 4, w: 3, h: 4 }],
    ['right', { x: 4, y: 4, w: 5, h: 4 }, { x: 4, y: 4, w: 3, h: 4 }],
    ['up', { x: 4, y: 3, w: 4, h: 5 }, { x: 4, y: 5, w: 4, h: 3 }],
    ['down', { x: 4, y: 4, w: 4, h: 5 }, { x: 4, y: 4, w: 4, h: 3 }],
  ])('moves the %s edge out to grow and in to shrink', (dir, grown, shrunk) => {
    expect(edgeStep(tile, dir, 'grow')).toEqual(grown)
    expect(edgeStep(tile, dir, 'shrink')).toEqual(shrunk)
  })

  const widgets: Record<string, WidgetInfo> = {
    a: { title: '', description: '', minW: 2, minH: 2, defaultW: 2, defaultH: 2 },
    b: { title: '', description: '', minW: 2, minH: 2, defaultW: 2, defaultH: 2 },
  }
  const step = (layout: Tile[], dir: Direction) => {
    const a = layout.find((item) => item.i === 'a')!
    const out = resizeTile(widgets, layout, 'a', edgeStep(a, dir, 'grow'))
    return out?.find((item) => item.i === 'a')
  }

  it('grows left and up into a neighbour, squeezing it, as a pointer resize would', () => {
    const sideBySide: Tile[] = [
      { i: 'b', x: 0, y: 0, w: 6, h: 14 },
      { i: 'a', x: 6, y: 0, w: 6, h: 14 },
    ]
    expect(step(sideBySide, 'left')).toMatchObject({ x: 5, w: 7 })
    const stacked: Tile[] = [
      { i: 'b', x: 0, y: 0, w: 12, h: 7 },
      { i: 'a', x: 0, y: 7, w: 12, h: 7 },
    ]
    expect(step(stacked, 'up')).toMatchObject({ y: 6, h: 8 })
    expect(step(stacked, 'right')).toMatchObject({ x: 0, w: 12 })
  })
})

describe('neighbourInDirection', () => {
  // The default Overview: Calendar over Day agenda; Upcoming over To-do; Progress over Notepad;
  // Modules across the bottom.
  it.each<[WidgetId, 'left' | 'right' | 'up' | 'down', WidgetId | null]>([
    ['calendar', 'right', 'upcoming'],
    ['upcoming', 'right', 'progress'],
    ['progress', 'right', null],
    ['todo', 'left', 'calendar'],
    ['notepad', 'left', 'todo'],
    ['calendar', 'left', null],
    ['calendar', 'down', 'agenda'],
    ['agenda', 'down', 'modules'],
    ['modules', 'down', null],
    ['modules', 'up', 'agenda'],
    ['todo', 'up', 'upcoming'],
    ['upcoming', 'up', null],
  ])('%s, going %s, finds %s', (id, dir, expected) => {
    expect(neighbourInDirection(DEFAULT_LAYOUT, id, dir)).toBe(expected)
  })

  it('prefers the topmost of two equally near widgets', () => {
    // a's rows reach both b (on top) and c (below it), both at x 6.
    const layout: Tile[] = [
      { i: 'a', x: 0, y: 0, w: 6, h: 10 },
      { i: 'c', x: 6, y: 5, w: 6, h: 5 },
      { i: 'b', x: 6, y: 0, w: 6, h: 5 },
    ]
    expect(neighbourInDirection(layout, 'a', 'right')).toBe('b')
  })
})

describe('nudgeTile', () => {
  const layout: Tile[] = [
    { i: 'a', x: 0, y: 0, w: 4, h: 4 },
    { i: 'b', x: 8, y: 0, w: 4, h: 4 },
  ]

  it('moves a widget one column into free space', () => {
    expect(nudgeTile(layout, 'a', 1)).toEqual(expect.arrayContaining([{ i: 'a', x: 1, y: 0, w: 4, h: 4 }]))
  })

  it('refuses to leave the board or run into another widget', () => {
    expect(nudgeTile(layout, 'a', -1)).toBeNull()
    expect(nudgeTile(layout, 'b', 1)).toBeNull()
    expect(nudgeTile([layout[0], { i: 'b', x: 4, y: 2, w: 4, h: 4 }], 'a', 1)).toBeNull()
  })
})
