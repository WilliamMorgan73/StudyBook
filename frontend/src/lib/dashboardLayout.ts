// Dashboard boards and their layout rules. A board is a widget registry plus a default layout;
// the Overview's lives here (OVERVIEW_BOARD, saved as `app_settings.dashboard_layout`) and the
// module page's in `lib/moduleLayout.ts` (saved per module as `modules.dashboard_layout`). A layout
// is a list of widgets on a 12-column grid (an instance id, a widget type, its settings and a place),
// stored as null when it's the board's default. The backend only checks the shape; widget types and
// their settings are owned here, so everything read back from storage goes through `normalizeLayout`.
//
// The grid is a fixed board, DASHBOARD_COLUMNS wide and DASHBOARD_ROWS tall, stretched to fill the
// screen: a widget's size is a share of the screen, so a layout looks the same on any display and
// nothing can be placed below the bottom edge.

import { verticalCompactor } from 'react-grid-layout'

import { CARD_OF_THE_DAY_CONFIG } from '@/lib/cardOfTheDay'
import { CLOCK_CONFIG } from '@/lib/clock'
import { DAY_LIST_CONFIG, DAY_LIST_DEFAULT } from '@/lib/dayList'
import { GRADE_TARGET_CONFIG } from '@/lib/gradeTarget'
import { PINNED_CONFIG } from '@/lib/pinned'
import { TIMELINE_CONFIG } from '@/lib/timeline'

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
  | 'clock'
  | 'timeline'
  | 'gradeTarget'
  | 'pinned'
  | 'now'
  | 'cardOfTheDay'
  | 'weakestTopics'
  | 'activity'

/** A widget's place on the grid. `i` is the instance id, unique on its board. */
export interface Tile {
  i: string
  x: number
  y: number
  w: number
  h: number
}

/** A widget's own settings, shaped by its `WidgetInfo.config`. */
export type WidgetConfig = Record<string, unknown>

/**
 * One widget on a board. The first copy of a widget has its type as its id (as every layout saved
 * before copies existed does); further copies get `<type>-2`, `<type>-3`, ...
 */
export interface LayoutItem<Id extends string = string> extends Tile {
  type: Id
  /** Present exactly when the widget has settings (`WidgetInfo.config`), normalized. */
  config?: WidgetConfig
}

/** How a widget's settings are read back from storage. */
export interface WidgetConfigSpec<C extends WidgetConfig = WidgetConfig> {
  /** Usable settings from whatever was stored, filling in defaults; `normalize(undefined)` is the default. */
  normalize: (raw: unknown) => C
}

export interface WidgetInfo {
  title: string
  /** One line for the "Add widget" menu. */
  description: string
  minW: number
  minH: number
  defaultW: number
  defaultH: number
  /** Can be placed more than once, so "Add widget" still offers it once it's on the board. */
  multiple?: boolean
  /** Has settings of its own, edited from the ⚙ in its header while editing the layout. */
  config?: WidgetConfigSpec
}

/** A widget registry and the layout a board starts with (and resets to). */
export interface Board<Id extends string> {
  widgets: Record<Id, WidgetInfo>
  defaultLayout: LayoutItem<Id>[]
}

/** Widgets on both boards, so both registries share one entry. */
export const CLOCK_WIDGET: WidgetInfo = {
  title: 'Clock',
  description: 'The time here or anywhere, digital or analog',
  minW: 2,
  minH: 2,
  defaultW: 3,
  defaultH: 3,
  multiple: true,
  config: CLOCK_CONFIG,
}

export const WIDGETS: Record<WidgetId, WidgetInfo> = {
  calendar: {
    title: 'Calendar',
    description: 'Month view of lectures, deadlines, exams and revision',
    minW: 4,
    minH: 6,
    defaultW: 6,
    defaultH: 7,
    config: DAY_LIST_CONFIG,
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
  clock: CLOCK_WIDGET,
  timeline: {
    title: 'Deadline timeline',
    description: 'The next few weeks, with deadlines and exams on their dates',
    minW: 4,
    minH: 2,
    defaultW: 8,
    defaultH: 3,
    multiple: true,
    config: TIMELINE_CONFIG,
  },
  gradeTarget: {
    title: 'Grade target',
    description: 'What you need in what’s left to hit a target class',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    multiple: true,
    config: GRADE_TARGET_CONFIG,
  },
  pinned: {
    title: 'Pinned',
    description: 'Quick-launch tiles for modules, topics, assignments and links',
    minW: 2,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
    multiple: true,
    config: PINNED_CONFIG,
  },
  now: {
    title: 'Now',
    description: 'The lecture you’re in, today’s revision or what’s due next',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 4,
  },
  cardOfTheDay: {
    title: 'Card of the day',
    description: 'Review due flashcards one at a time, right here',
    minW: 3,
    minH: 4,
    defaultW: 4,
    defaultH: 6,
    multiple: true,
    config: CARD_OF_THE_DAY_CONFIG,
  },
  weakestTopics: {
    title: 'Weakest topics',
    description: 'The topics whose flashcards you forget most',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
  },
  activity: {
    title: 'Study activity',
    description: 'Flashcard reviews per day, and your streak',
    minW: 3,
    minH: 3,
    defaultW: 6,
    defaultH: 3,
  },
}

export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[]

/** Today's page: Calendar over its day agenda, two columns of two cards, Modules across the bottom. */
export const DEFAULT_LAYOUT: LayoutItem<WidgetId>[] = [
  { i: 'calendar', type: 'calendar', config: { ...DAY_LIST_DEFAULT }, x: 0, y: 0, w: 6, h: 7 },
  { i: 'agenda', type: 'agenda', x: 0, y: 7, w: 6, h: 3 },
  { i: 'upcoming', type: 'upcoming', x: 6, y: 0, w: 3, h: 5 },
  { i: 'todo', type: 'todo', x: 6, y: 5, w: 3, h: 5 },
  { i: 'progress', type: 'progress', x: 9, y: 0, w: 3, h: 5 },
  { i: 'notepad', type: 'notepad', x: 9, y: 5, w: 3, h: 5 },
  { i: 'modules', type: 'modules', x: 0, y: 10, w: 12, h: 4 },
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
      { i: 'calendar', type: 'calendar', config: { ...DAY_LIST_DEFAULT }, x: 0, y: 0, w: 8, h: 10 },
      { i: 'agenda', type: 'agenda', x: 8, y: 0, w: 4, h: 5 },
      { i: 'upcoming', type: 'upcoming', x: 8, y: 5, w: 4, h: 5 },
      { i: 'modules', type: 'modules', x: 0, y: 10, w: 12, h: 4 },
    ],
  },
  {
    id: 'study',
    label: 'Study',
    description: 'Today’s revision and due flashcards first, then the calendar.',
    layout: [
      { i: 'revisionToday', type: 'revisionToday', x: 0, y: 0, w: 4, h: 5 },
      { i: 'flashcardsDue', type: 'flashcardsDue', x: 4, y: 0, w: 4, h: 5 },
      { i: 'progress', type: 'progress', x: 8, y: 0, w: 4, h: 5 },
      { i: 'calendar', type: 'calendar', config: { ...DAY_LIST_DEFAULT }, x: 0, y: 5, w: 6, h: 9 },
      { i: 'upcoming', type: 'upcoming', x: 6, y: 5, w: 3, h: 9 },
      { i: 'todo', type: 'todo', x: 9, y: 5, w: 3, h: 9 },
    ],
  },
  {
    id: 'simple',
    label: 'Simple',
    description: 'Your modules, what’s due, and a to-do list. Nothing else.',
    layout: [
      { i: 'modules', type: 'modules', x: 0, y: 0, w: 12, h: 6 },
      { i: 'upcoming', type: 'upcoming', x: 0, y: 6, w: 6, h: 8 },
      { i: 'todo', type: 'todo', x: 6, y: 6, w: 6, h: 8 },
    ],
  },
]

function isWidgetId<Id extends string>(board: Board<Id>, value: unknown): value is Id {
  return typeof value === 'string' && Object.hasOwn(board.widgets, value)
}

function toInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

/** Longest instance id the backend stores. */
const MAX_INSTANCE_ID = 32

/**
 * A usable layout from whatever was stored: items of unknown type, with a duplicate instance id,
 * a second copy of a widget that can't be placed twice, or malformed fields are dropped. Items
 * saved before copies existed (no `type`) are the widget their id names. Each item is clamped to
 * its widget's minimum size and the board, its settings go through the widget's `normalize`, and a
 * layout taller than the board is scaled down to fit it. Null, non-arrays and layouts left with no
 * widgets fall back to the board's default layout.
 */
export function normalizeLayout<Id extends string>(board: Board<Id>, raw: unknown): LayoutItem<Id>[] {
  if (!Array.isArray(raw)) return board.defaultLayout
  const seenIds = new Set<string>()
  const seenTypes = new Set<Id>()
  const items: LayoutItem<Id>[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { i, type = i, config, x, y, w, h } = entry as Record<string, unknown>
    const nums = [toInt(x), toInt(y), toInt(w), toInt(h)]
    if (typeof i !== 'string' || i === '' || i.length > MAX_INSTANCE_ID || seenIds.has(i)) continue
    if (!isWidgetId(board, type) || nums.some((n) => n === null)) continue
    const info = board.widgets[type]
    if (seenTypes.has(type) && !info.multiple) continue
    const [nx, ny, nw, nh] = nums as number[]
    const width = Math.min(DASHBOARD_COLUMNS, Math.max(info.minW, nw))
    items.push({
      i,
      type,
      ...(info.config && { config: info.config.normalize(config) }),
      x: Math.min(DASHBOARD_COLUMNS - width, Math.max(0, nx)),
      y: Math.max(0, ny),
      w: width,
      h: Math.min(DASHBOARD_ROWS, Math.max(info.minH, nh)),
    })
    seenIds.add(i)
    seenTypes.add(type)
  }
  return items.length > 0 ? fitToBoard(board, items) : board.defaultLayout
}

/** How many rows the layout uses. */
export function layoutBottom(layout: readonly Tile[]): number {
  return Math.max(0, ...layout.map((item) => item.y + item.h))
}

/** The layout compacted the way the board compacts (widgets float up), keeping each item's other fields. */
function compactTiles<T extends Tile>(layout: readonly T[]): T[] {
  const byId = new Map(layout.map((item) => [item.i, item]))
  return verticalCompactor
    .compact(
      layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
      DASHBOARD_COLUMNS,
    )
    .map(({ i, x, y, w, h }) => ({ ...byId.get(i)!, x, y, w, h }))
}

/** Squeezes a layout taller than the board (one saved before the board existed) down onto it. */
function fitToBoard<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[]): LayoutItem<Id>[] {
  const bottom = layoutBottom(layout)
  if (bottom <= DASHBOARD_ROWS) return layout
  const scale = DASHBOARD_ROWS / bottom
  const minH = (item: LayoutItem<Id>) => board.widgets[item.type].minH
  const scaled = layout.map((item) => ({
    ...item,
    y: Math.round(item.y * scale),
    h: Math.max(minH(item), Math.round(item.h * scale)),
  }))
  // Rounding can leave overlaps or gaps; compacting settles every widget as high as it fits.
  // Whatever still hangs off the bottom shrinks, as far as its minimum allows.
  return compactTiles(scaled).map((item) => ({ ...item, h: Math.max(minH(item), Math.min(item.h, DASHBOARD_ROWS - item.y)) }))
}

/**
 * What "Add widget" offers, in registry order: widgets not on the layout, and those that can be
 * placed more than once.
 */
export function addableWidgets<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[]): Id[] {
  const placed = new Set(layout.map((item) => item.type))
  return (Object.keys(board.widgets) as Id[]).filter((type) => board.widgets[type].multiple || !placed.has(type))
}

/** Each placed widget's size limits by instance id, for `resizeTile`. */
export function widgetsByInstance<Id extends string>(
  widgets: Record<Id, WidgetInfo>,
  layout: readonly Pick<LayoutItem<Id>, 'i' | 'type'>[],
): Record<string, WidgetInfo> {
  return Object.fromEntries(layout.map((item) => [item.i, widgets[item.type]]))
}

function overlaps(a: Omit<Tile, 'i'>, b: Tile): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Where a widget fits in the board's free space: the topmost, then leftmost, spot at the largest
 * size it can have, from its default size down to its minimum. Null if there's no room even at
 * its minimum.
 */
function findSpace<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[], type: Id): Omit<Tile, 'i'> | null {
  const { minW, minH, defaultW, defaultH } = board.widgets[type]
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
export function canAddWidget<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[], type: Id): boolean {
  return findSpace(board, layout, type) !== null
}

/** An unused instance id for another copy of a widget: its type if free, else `<type>-2`, `<type>-3`, ... */
function newInstanceId(layout: readonly Tile[], type: string): string {
  const taken = new Set(layout.map((item) => item.i))
  if (!taken.has(type)) return type
  let n = 2
  while (taken.has(`${type}-${n}`)) n++
  return `${type}-${n}`
}

/**
 * Adds a widget, with its default settings, in the board's free space (see `findSpace`).
 * Unchanged if there's no room for it, or it's already placed and can't be placed twice.
 */
export function addWidget<Id extends string>(board: Board<Id>, layout: LayoutItem<Id>[], type: Id): LayoutItem<Id>[] {
  const info = board.widgets[type]
  if (!info.multiple && layout.some((item) => item.type === type)) return layout
  const spot = findSpace(board, layout, type)
  if (!spot) return layout
  return [...layout, { i: newInstanceId(layout, type), type, ...(info.config && { config: info.config.normalize(undefined) }), ...spot }]
}

/** Removes one widget, by instance id. */
export function removeWidget<Id extends string>(layout: LayoutItem<Id>[], id: string): LayoutItem<Id>[] {
  return layout.filter((item) => item.i !== id)
}

/** The layout with one widget's settings replaced. */
export function configureWidget<Id extends string>(layout: LayoutItem<Id>[], id: string, config: WidgetConfig): LayoutItem<Id>[] {
  return layout.map((item) => (item.i === id ? { ...item, config } : item))
}

/** Reading order (top to bottom, then left to right), for the single-column layout on narrow screens. */
export function stackedOrder<T extends Tile>(layout: readonly T[]): T[] {
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

type Comparable = Tile & Pick<Partial<LayoutItem>, 'type' | 'config'>

/** Same widgets with the same settings, at the same places and sizes, ignoring order. */
export function sameLayout(a: readonly Comparable[], b: readonly Comparable[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((item) => [item.i, item]))
  return a.every((item) => {
    const other = byId.get(item.i)
    return (
      other !== undefined &&
      other.type === item.type &&
      JSON.stringify(other.config) === JSON.stringify(item.config) &&
      other.x === item.x &&
      other.y === item.y &&
      other.w === item.w &&
      other.h === item.h
    )
  })
}

/**
 * The layout with widgets `a` and `b` trading places (each keeps its own size), compacted the way
 * the board compacts. A widget too wide for the other's column is pulled left to stay on the
 * board. Null if the result would hang off the bottom of the board.
 */
export function swapTiles<T extends Tile>(layout: readonly T[], a: string, b: string): T[] | null {
  const first = layout.find((item) => item.i === a)
  const second = layout.find((item) => item.i === b)
  if (!first || !second || a === b) return null
  const swapped = layout.map((item) => {
    const other = item.i === a ? second : item.i === b ? first : null
    if (!other) return { ...item }
    return { ...item, x: Math.min(other.x, DASHBOARD_COLUMNS - item.w), y: other.y }
  })
  const out = compactTiles(swapped)
  return layoutBottom(out) <= DASHBOARD_ROWS ? out : null
}

/**
 * The grid cell under a point, given in px from the grid's top-left corner (padding included) on a
 * grid `width` px wide with rows `rowHeight` px tall. A gap between cells counts as the cell before
 * it, and points outside the board snap to its nearest cell.
 */
export function cellAt(px: number, py: number, width: number, rowHeight: number): { col: number; row: number } {
  const colWidth = (width - DASHBOARD_MARGIN * (DASHBOARD_COLUMNS + 1)) / DASHBOARD_COLUMNS
  const clamp = (n: number, max: number) => Math.min(max - 1, Math.max(0, n))
  return {
    col: clamp(Math.floor((px - DASHBOARD_MARGIN) / (colWidth + DASHBOARD_MARGIN)), DASHBOARD_COLUMNS),
    row: clamp(Math.floor((py - DASHBOARD_MARGIN) / (rowHeight + DASHBOARD_MARGIN)), DASHBOARD_ROWS),
  }
}

/** The widget covering a grid cell, other than `exclude`; null for empty space. */
export function tileAt(layout: readonly Tile[], col: number, row: number, exclude: string): string | null {
  const hit = layout.find(
    (item) => item.i !== exclude && col >= item.x && col < item.x + item.w && row >= item.y && row < item.y + item.h,
  )
  return hit ? hit.i : null
}

/**
 * The layout with widget `id` resized to `to` from its spot in `layout` (the layout when the resize
 * began). Each edge that moves outwards squeezes what's in its way:
 * - right or left: the widgets beside it get narrower, keeping their far edges;
 * - down: the widgets below are pushed further down if the board has room, else get shorter,
 *   keeping their bottom edges;
 * - up: the widgets above get shorter, keeping their tops (the board packs widgets upwards, so
 *   there's nowhere to push them).
 * An edge stops once a widget it's squeezing reaches its minimum size, so the widgets squeezed all
 * lose the same amount. Edges moving inwards leave the others as they were in `layout`. Null if
 * the result still wouldn't fit the board.
 */
export function resizeTile<T extends Tile>(
  widgets: Record<string, WidgetInfo>,
  layout: readonly T[],
  id: string,
  to: Omit<Tile, 'i'>,
): T[] | null {
  const start = layout.find((item) => item.i === id)
  if (!start) return null
  let items = layout.map((item) => ({ ...item }))
  const self = items.find((item) => item.i === id)!
  const others = items.filter((item) => item !== self)
  const minW = (item: T) => widgets[item.i].minW
  const minH = (item: T) => widgets[item.i].minH
  const [oldLeft, oldRight, oldTop, oldBottom] = [start.x, start.x + start.w, start.y, start.y + start.h]

  // Sideways: what starts inside the new width, on the widget's rows, gives way.
  const inRows = (item: Tile) => item.y < oldBottom && oldTop < item.y + item.h
  let right = Math.min(DASHBOARD_COLUMNS, Math.max(oldRight, to.x + to.w))
  const toRight = others.filter((item) => inRows(item) && item.x >= oldRight)
  for (const item of toRight) if (item.x < right) right = Math.min(right, item.x + item.w - minW(item))
  right = Math.max(oldRight, right)
  for (const item of toRight) {
    if (item.x < right) [item.w, item.x] = [item.x + item.w - right, right]
  }
  let left = Math.max(0, Math.min(oldLeft, to.x))
  const toLeft = others.filter((item) => inRows(item) && item.x + item.w <= oldLeft)
  for (const item of toLeft) if (item.x + item.w > left) left = Math.max(left, item.x + minW(item))
  left = Math.min(oldLeft, left)
  for (const item of toLeft) {
    if (item.x + item.w > left) item.w = left - item.x
  }
  self.x = to.x < oldLeft ? left : to.x
  self.w = (to.x + to.w > oldRight ? right : to.x + to.w) - self.x

  // Up: what ends inside the new height, above the widget (at its new width), gets shorter.
  const inCols = (item: Tile) => item.x < self.x + self.w && self.x < item.x + item.w
  let top = Math.max(0, Math.min(oldTop, to.y))
  const above = others.filter((item) => inCols(item) && item.y + item.h <= oldTop)
  for (const item of above) if (item.y + item.h > top) top = Math.max(top, item.y + minH(item))
  top = Math.min(oldTop, top)
  for (const item of above) {
    if (item.y + item.h > top) item.h = top - item.y
  }
  self.y = to.y < oldTop ? top : to.y
  const wantBottom = to.y + to.h
  self.h = wantBottom - self.y

  const compact = compactTiles<T>
  const fits = (l: T[]) => layoutBottom(l) <= DASHBOARD_ROWS

  const pushed = compact(items)
  if (wantBottom <= oldBottom || fits(pushed)) return fits(pushed) ? pushed : null

  // Down, with no room to push: what starts inside the new height, below the widget, gets shorter.
  const below = others.filter((item) => inCols(item) && item.y >= oldBottom)
  let bottom = wantBottom
  for (const item of below) if (item.y < bottom) bottom = Math.min(bottom, item.y + item.h - minH(item))
  bottom = Math.max(oldBottom, bottom)
  items = items.map((item) =>
    below.includes(item) && item.y < bottom ? { ...item, h: item.y + item.h - bottom, y: bottom } : item,
  )
  items.find((item) => item.i === id)!.h = bottom - self.y
  const shrunk = compact(items)
  return fits(shrunk) ? shrunk : null
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * A widget's place with one edge moved a cell: outwards when growing, inwards when shrinking.
 * Growing `left` moves the left edge left, shrinking `left` moves it right, and so on, so the
 * keys work on the side they point at. For `resizeTile`, which squeezes whatever is in the way.
 */
export function edgeStep(tile: Omit<Tile, 'i'>, dir: Direction, mode: 'grow' | 'shrink'): Omit<Tile, 'i'> {
  const d = mode === 'grow' ? 1 : -1
  const { x, y, w, h } = tile
  switch (dir) {
    case 'left':
      return { x: x - d, y, w: w + d, h }
    case 'right':
      return { x, y, w: w + d, h }
    case 'up':
      return { x, y: y - d, w, h: h + d }
    case 'down':
      return { x, y, w, h: h + d }
  }
}

/**
 * The closest widget beside `id` in a direction: one sharing some of its rows (left and right) or
 * columns (up and down), nearest first, then topmost or leftmost. Null if there's none that way.
 */
export function neighbourInDirection(layout: readonly Tile[], id: string, dir: Direction): string | null {
  const self = layout.find((item) => item.i === id)
  if (!self) return null
  const sharesRows = (item: Tile) => item.y < self.y + self.h && self.y < item.y + item.h
  const sharesCols = (item: Tile) => item.x < self.x + self.w && self.x < item.x + item.w
  // How far each candidate is (smaller is nearer), and the tiebreak (smaller wins).
  const measures: Record<Direction, (item: Tile) => [number, number] | null> = {
    right: (item) => (sharesRows(item) && item.x >= self.x + self.w ? [item.x, item.y] : null),
    left: (item) => (sharesRows(item) && item.x + item.w <= self.x ? [-(item.x + item.w), item.y] : null),
    down: (item) => (sharesCols(item) && item.y >= self.y + self.h ? [item.y, item.x] : null),
    up: (item) => (sharesCols(item) && item.y + item.h <= self.y ? [-(item.y + item.h), item.x] : null),
  }
  let best: { id: string; at: [number, number] } | null = null
  for (const item of layout) {
    const at = item.i === id ? null : measures[dir](item)
    if (at && (!best || at[0] < best.at[0] || (at[0] === best.at[0] && at[1] < best.at[1]))) best = { id: item.i, at }
  }
  return best?.id ?? null
}

/**
 * The layout with widget `id` moved one column left (-1) or right (1), compacted. Null if that
 * would leave the board or the column isn't free on the widget's rows.
 */
export function nudgeTile<T extends Tile>(layout: readonly T[], id: string, dx: -1 | 1): T[] | null {
  const self = layout.find((item) => item.i === id)
  if (!self) return null
  const moved = { ...self, x: self.x + dx }
  if (moved.x < 0 || moved.x + moved.w > DASHBOARD_COLUMNS) return null
  if (layout.some((item) => item.i !== id && overlaps(moved, item))) return null
  return compactTiles(layout.map((item) => (item.i === id ? moved : item)))
}
