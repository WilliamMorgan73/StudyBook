// The Overview dashboard's widget registry and layout rules. A layout is a list of
// react-grid-layout items on a 12-column grid, saved as `app_settings.dashboard_layout`
// (null = DEFAULT_LAYOUT). The backend only checks the shape; widget ids are owned here, so
// everything read back from storage goes through `normalizeLayout`.

export const DASHBOARD_COLUMNS = 12
export const DASHBOARD_ROW_HEIGHT = 40
/** Gap between widgets, matching the `gap-6` the page used before it was customisable. */
export const DASHBOARD_MARGIN = 24

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

export interface LayoutItem {
  i: WidgetId
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

export const WIDGETS: Record<WidgetId, WidgetInfo> = {
  calendar: {
    title: 'Calendar',
    description: 'Month view of lectures, deadlines, exams and revision',
    minW: 4,
    minH: 7,
    defaultW: 6,
    defaultH: 9,
  },
  agenda: {
    title: 'Day agenda',
    description: "The calendar's selected day, event by event",
    minW: 3,
    minH: 3,
    defaultW: 6,
    defaultH: 4,
  },
  upcoming: {
    title: 'Upcoming assignments',
    description: 'What is due next',
    minW: 3,
    minH: 3,
    defaultW: 3,
    defaultH: 7,
  },
  todo: { title: 'To-do', description: 'A quick checklist', minW: 2, minH: 3, defaultW: 3, defaultH: 6 },
  progress: {
    title: 'Progress',
    description: 'Grade achieved across your modules',
    minW: 2,
    minH: 5,
    defaultW: 3,
    defaultH: 7,
  },
  notepad: { title: 'Notepad', description: 'Scratch space for quick notes', minW: 2, minH: 3, defaultW: 3, defaultH: 6 },
  modules: { title: 'Modules', description: 'Every module, with its progress', minW: 3, minH: 3, defaultW: 12, defaultH: 6 },
  revisionToday: {
    title: "Today's revision",
    description: 'Revision sessions planned for today',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
  },
  flashcardsDue: {
    title: 'Flashcards due',
    description: 'Cards due for review in each module',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
  },
}

export const WIDGET_IDS = Object.keys(WIDGETS) as WidgetId[]

/** Today's page: Calendar over its day agenda, two columns of two cards, Modules across the bottom. */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'calendar', x: 0, y: 0, w: 6, h: 9 },
  { i: 'agenda', x: 0, y: 9, w: 6, h: 4 },
  { i: 'upcoming', x: 6, y: 0, w: 3, h: 7 },
  { i: 'todo', x: 6, y: 7, w: 3, h: 6 },
  { i: 'progress', x: 9, y: 0, w: 3, h: 7 },
  { i: 'notepad', x: 9, y: 7, w: 3, h: 6 },
  { i: 'modules', x: 0, y: 13, w: 12, h: 6 },
]

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && Object.hasOwn(WIDGETS, value)
}

function toInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

/**
 * A usable layout from whatever was stored: unknown, duplicate or malformed items are dropped and
 * each item is clamped to its widget's minimum size and the grid width. Null, non-arrays and
 * layouts left with no widgets fall back to DEFAULT_LAYOUT.
 */
export function normalizeLayout(raw: unknown): LayoutItem[] {
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT
  const seen = new Set<WidgetId>()
  const items: LayoutItem[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { i, x, y, w, h } = entry as Record<string, unknown>
    const nums = [toInt(x), toInt(y), toInt(w), toInt(h)]
    if (!isWidgetId(i) || seen.has(i) || nums.some((n) => n === null)) continue
    const [nx, ny, nw, nh] = nums as number[]
    const info = WIDGETS[i]
    const width = Math.min(DASHBOARD_COLUMNS, Math.max(info.minW, nw))
    items.push({
      i,
      x: Math.min(DASHBOARD_COLUMNS - width, Math.max(0, nx)),
      y: Math.max(0, ny),
      w: width,
      h: Math.max(info.minH, nh),
    })
    seen.add(i)
  }
  return items.length > 0 ? items : DEFAULT_LAYOUT
}

/** Widgets not on the layout, in registry order: what "Add widget" offers. */
export function hiddenWidgets(layout: LayoutItem[]): WidgetId[] {
  const placed = new Set(layout.map((item) => item.i))
  return WIDGET_IDS.filter((id) => !placed.has(id))
}

/** Adds a widget at its default size below everything else (no-op if it's already placed). */
export function addWidget(layout: LayoutItem[], id: WidgetId): LayoutItem[] {
  if (layout.some((item) => item.i === id)) return layout
  const bottom = Math.max(0, ...layout.map((item) => item.y + item.h))
  const { defaultW, defaultH } = WIDGETS[id]
  return [...layout, { i: id, x: 0, y: bottom, w: defaultW, h: defaultH }]
}

export function removeWidget(layout: LayoutItem[], id: WidgetId): LayoutItem[] {
  return layout.filter((item) => item.i !== id)
}

/** Reading order (top to bottom, then left to right), for the single-column layout on narrow screens. */
export function stackedOrder(layout: LayoutItem[]): LayoutItem[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
}

/** A widget's height in pixels on the grid, which the single-column layout reuses. */
export function widgetHeight(h: number): number {
  return h * DASHBOARD_ROW_HEIGHT + (h - 1) * DASHBOARD_MARGIN
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
