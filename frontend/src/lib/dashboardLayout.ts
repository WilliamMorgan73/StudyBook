// Dashboard boards and their layout rules. A board is a widget registry plus a default layout;
// the Overview's lives here (OVERVIEW_BOARD, saved as `app_settings.dashboard_layout`) and the
// module page's in `lib/moduleLayout.ts` (saved per module as `modules.dashboard_layout`). A layout
// is a list of react-grid-layout items on a 12-column grid, stored as null when it's the board's
// default. The backend only checks the shape; widget ids are owned here, so everything read back
// from storage goes through `normalizeLayout`.
//
// The grid is a fixed board, DASHBOARD_COLUMNS wide and DASHBOARD_ROWS tall, stretched to fill the
// screen: a widget's size is a share of the screen, so a layout looks the same on any display and
// nothing can be placed below the bottom edge.

import { verticalCompactor } from 'react-grid-layout'

export const DASHBOARD_COLUMNS = 12
export const DASHBOARD_ROWS = 14
/** Row height in the single-column layout on narrow screens, which scrolls instead of fitting. */
export const DASHBOARD_ROW_HEIGHT = 40
/** The shortest a fitted grid row gets; below this the board scrolls instead of shrinking further. */
export const DASHBOARD_MIN_ROW_HEIGHT = 20
/** Gap between widgets, and between the widgets and the board's edge. */
export const DASHBOARD_MARGIN = 16

export type WidgetId =
  | 'calendar'
  | 'agenda'
  | 'upcoming'
  | 'todo'
  | 'progress'
  | 'notepad'
  | 'modules'
  | 'revisionToday'
  | 'flashcardsDue'

export interface LayoutItem<Id extends string = string> {
  i: Id
  x: number
  y: number
  w: number
  h: number
}

export interface WidgetInfo {
  title: string
  /** One line for the "Add widget" menu. */
  description: string
  minW: number
  minH: number
  defaultW: number
  defaultH: number
}

/** A widget registry and the layout a board starts with (and resets to). */
export interface Board<Id extends string> {
  widgets: Record<Id, WidgetInfo>
  defaultLayout: LayoutItem<Id>[]
}

export const WIDGETS: Record<WidgetId, WidgetInfo> = {
  calendar: {
    title: 'Calendar',
    description: 'Month view of lectures, deadlines, exams and revision',
    minW: 4,
    minH: 6,
    defaultW: 6,
    defaultH: 7,
  },
  agenda: {
    title: 'Day agenda',
    description: "The calendar's selected day, event by event",
    minW: 3,
    minH: 2,
    defaultW: 6,
    defaultH: 3,
  },
  upcoming: {
    title: 'Upcoming assignments',
    description: 'What is due next',
    minW: 3,
    minH: 3,
    defaultW: 3,
    defaultH: 5,
  },
  todo: { title: 'To-do', description: 'A quick checklist', minW: 2, minH: 3, defaultW: 3, defaultH: 5 },
  progress: {
    title: 'Progress',
    description: 'Grade achieved across your modules',
    minW: 2,
    minH: 4,
    defaultW: 3,
    defaultH: 5,
  },
  notepad: { title: 'Notepad', description: 'Scratch space for quick notes', minW: 2, minH: 3, defaultW: 3, defaultH: 5 },
  modules: { title: 'Modules', description: 'Every module, with its progress', minW: 3, minH: 3, defaultW: 12, defaultH: 4 },
  revisionToday: {
    title: "Today's revision",
    description: 'Revision sessions planned for today',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 4,
  },
  flashcardsDue: {
    title: 'Flashcards due',
    description: 'Cards due for review in each module',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 4,
  },
}

export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[]

/** Today's page: Calendar over its day agenda, two columns of two cards, Modules across the bottom. */
export const DEFAULT_LAYOUT: LayoutItem<WidgetId>[] = [
  { i: 'calendar', x: 0, y: 0, w: 6, h: 7 },
  { i: 'agenda', x: 0, y: 7, w: 6, h: 3 },
  { i: 'upcoming', x: 6, y: 0, w: 3, h: 5 },
  { i: 'todo', x: 6, y: 5, w: 3, h: 5 },
  { i: 'progress', x: 9, y: 0, w: 3, h: 5 },
  { i: 'notepad', x: 9, y: 5, w: 3, h: 5 },
  { i: 'modules', x: 0, y: 10, w: 12, h: 4 },
]

export const OVERVIEW_BOARD: Board<WidgetId> = { widgets: WIDGETS, defaultLayout: DEFAULT_LAYOUT }

/** Starting points for the Overview offered by the setup page, all within the 12 × 14 board. */
export const OVERVIEW_LAYOUT_PRESETS: { id: string; label: string; description: string; layout: LayoutItem<WidgetId>[] }[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Calendar and its day, deadlines, to-dos, progress and a notepad, with modules underneath.',
    layout: DEFAULT_LAYOUT,
  },
  {
    id: 'planner',
    label: 'Planner',
    description: 'A big calendar, with the day and what’s due beside it.',
    layout: [
      { i: 'calendar', x: 0, y: 0, w: 8, h: 10 },
      { i: 'agenda', x: 8, y: 0, w: 4, h: 5 },
      { i: 'upcoming', x: 8, y: 5, w: 4, h: 5 },
      { i: 'modules', x: 0, y: 10, w: 12, h: 4 },
    ],
  },
  {
    id: 'study',
    label: 'Study',
    description: 'Today’s revision and due flashcards first, then the calendar.',
    layout: [
      { i: 'revisionToday', x: 0, y: 0, w: 4, h: 5 },
      { i: 'flashcardsDue', x: 4, y: 0, w: 4, h: 5 },
      { i: 'progress', x: 8, y: 0, w: 4, h: 5 },
      { i: 'calendar', x: 0, y: 5, w: 6, h: 9 },
      { i: 'upcoming', x: 6, y: 5, w: 3, h: 9 },
      { i: 'todo', x: 9, y: 5, w: 3, h: 9 },
    ],
  },
  {
    id: 'simple',
    label: 'Simple',
    description: 'Your modules, what’s due, and a to-do list. Nothing else.',
    layout: [
      { i: 'modules', x: 0, y: 0, w: 12, h: 6 },
      { i: 'upcoming', x: 0, y: 6, w: 6, h: 8 },
      { i: 'todo', x: 6, y: 6, w: 6, h: 8 },
    ],
  },
]

function isWidgetId<Id extends string>(board: Board<Id>, value: unknown): value is Id {
  return typeof value === 'string' && Object.hasOwn(board.widgets, value)
}

function toInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

/**
 * A usable layout from whatever was stored: unknown, duplicate or malformed items are dropped,
 * each item is clamped to its widget's minimum size and the board, and a layout taller than the
 * board is scaled down to fit it. Null, non-arrays and layouts left with no widgets fall back to
 * the board's default layout.
 */
export function normalizeLayout<Id extends string>(board: Board<Id>, raw: unknown): LayoutItem<Id>[] {
  if (!Array.isArray(raw)) return board.defaultLayout
  const seen = new Set<Id>()
  const items: LayoutItem<Id>[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { i, x, y, w, h } = entry as Record<string, unknown>
    const nums = [toInt(x), toInt(y), toInt(w), toInt(h)]
    if (!isWidgetId(board, i) || seen.has(i) || nums.some((n) => n === null)) continue
    const [nx, ny, nw, nh] = nums as number[]
    const info = board.widgets[i]
    const width = Math.min(DASHBOARD_COLUMNS, Math.max(info.minW, nw))
    items.push({
      i,
      x: Math.min(DASHBOARD_COLUMNS - width, Math.max(0, nx)),
      y: Math.max(0, ny),
      w: width,
      h: Math.min(DASHBOARD_ROWS, Math.max(info.minH, nh)),
    })
    seen.add(i)
  }
  return items.length > 0 ? fitToBoard(board, items) : board.defaultLayout
}

/** How many rows the layout uses. */
export function layoutBottom(layout: LayoutItem[]): number {
  return Math.max(0, ...layout.map((item) => item.y + item.h))
}

/** Squeezes a layout taller than the board (one saved before the board existed) down onto it. */
function fitToBoard<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[]): LayoutItem<Id>[] {
  const bottom = layoutBottom(layout)
  if (bottom <= DASHBOARD_ROWS) return layout
  const scale = DASHBOARD_ROWS / bottom
  const scaled = layout.map((item) => ({
    ...item,
    y: Math.round(item.y * scale),
    h: Math.max(board.widgets[item.i].minH, Math.round(item.h * scale)),
  }))
  // Rounding can leave overlaps or gaps; compacting settles every widget as high as it fits.
  return verticalCompactor.compact(scaled, DASHBOARD_COLUMNS).map(({ i, x, y, w, h }) => ({
    i: i as Id,
    x,
    y,
    w,
    // Whatever still hangs off the bottom shrinks, as far as its minimum allows.
    h: Math.max(board.widgets[i as Id].minH, Math.min(h, DASHBOARD_ROWS - y)),
  }))
}

/** Widgets not on the layout, in registry order: what "Add widget" offers. */
export function hiddenWidgets<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[]): Id[] {
  const placed = new Set(layout.map((item) => item.i))
  return (Object.keys(board.widgets) as Id[]).filter((id) => !placed.has(id))
}

function overlaps(a: Omit<LayoutItem, 'i'>, b: LayoutItem): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Where a widget fits in the board's free space: the topmost, then leftmost, spot at the largest
 * size it can have, from its default size down to its minimum. Null if there's no room even at
 * its minimum.
 */
function findSpace<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[], id: Id): Omit<LayoutItem, 'i'> | null {
  const { minW, minH, defaultW, defaultH } = board.widgets[id]
  for (let h = defaultH; h >= minH; h--) {
    for (let w = defaultW; w >= minW; w--) {
      for (let y = 0; y + h <= DASHBOARD_ROWS; y++) {
        for (let x = 0; x + w <= DASHBOARD_COLUMNS; x++) {
          const spot = { x, y, w, h }
          if (!layout.some((item) => overlaps(spot, item))) return spot
        }
      }
    }
  }
  return null
}

/** Whether `addWidget` would find room for the widget. */
export function canAddWidget<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[], id: Id): boolean {
  return findSpace(board, layout, id) !== null
}

/**
 * Adds a widget in the board's free space (see `findSpace`). Unchanged if it's already placed or
 * there's no room for it.
 */
export function addWidget<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[], id: Id): LayoutItem<Id>[] {
  if (layout.some((item) => item.i === id)) return layout
  const spot = findSpace(board, layout, id)
  return spot ? [...layout, { i: id, ...spot }] : layout
}

export function removeWidget<Id extends string>(layout: LayoutItem<Id>[], id: Id): LayoutItem<Id>[] {
  return layout.filter((item) => item.i !== id)
}

/** Reading order (top to bottom, then left to right), for the single-column layout on narrow screens. */
export function stackedOrder<Id extends string>(layout: LayoutItem<Id>[]): LayoutItem<Id>[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
}

/** A widget's height in pixels on the grid, which the single-column layout reuses. */
export function widgetHeight(h: number): number {
  return h * DASHBOARD_ROW_HEIGHT + (h - 1) * DASHBOARD_MARGIN
}

/**
 * The whole-pixel row height that makes the board fill `height` px (padding and gaps included)
 * without overflowing it, never below DASHBOARD_MIN_ROW_HEIGHT.
 */
export function fitRowHeight(height: number): number {
  const rows = DASHBOARD_ROWS
  return Math.max(DASHBOARD_MIN_ROW_HEIGHT, Math.floor((height - DASHBOARD_MARGIN * (rows + 1)) / rows))
}

/** Same widgets at the same places and sizes, ignoring order. */
export function sameLayout(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((item) => [item.i, item]))
  return a.every((item) => {
    const other = byId.get(item.i)
    return other !== undefined && other.x === item.x && other.y === item.y && other.w === item.w && other.h === item.h
  })
}
