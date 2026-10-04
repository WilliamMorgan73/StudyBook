// The module page's board: its widget registry and default layout, saved per module as
// `modules.dashboard_layout` (null = MODULE_DEFAULT_LAYOUT). See `lib/dashboardLayout.ts`.

import { normalizeLayout, type Board, type LayoutItem, type WidgetInfo } from '@/lib/dashboardLayout'

export type ModuleWidgetId =
  | 'schedule'
  | 'dayAgenda'
  | 'submodules'
  | 'assignments'
  | 'flashcards'
  | 'revision'
  | 'progress'
  | 'exams'
  | 'lectures'
  | 'grades'
  | 'openTodos'
  | 'todo'
  | 'notepad'
  | 'related'

export const MODULE_WIDGETS: Record<ModuleWidgetId, WidgetInfo> = {
  schedule: {
    title: 'Schedule',
    description: "This week's lectures, exams and revision",
    minW: 6,
    minH: 4,
    defaultW: 12,
    defaultH: 5,
  },
  dayAgenda: {
    title: 'Day agenda',
    description: "The Schedule's selected day, event by event",
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 3,
  },
  submodules: { title: 'Submodules', description: "The module's notes", minW: 3, minH: 3, defaultW: 4, defaultH: 7 },
  assignments: {
    title: 'Assignments',
    description: 'Coursework and exams, by due date',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 7,
  },
  flashcards: {
    title: 'Flashcards',
    description: 'Cards in this module, and how many are due',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 7,
  },
  revision: {
    title: 'Upcoming revision',
    description: 'Revision sessions planned for the next two weeks',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
  },
  progress: {
    title: 'Progress',
    description: 'Grade achieved and work submitted, by assignment',
    minW: 2,
    minH: 4,
    defaultW: 3,
    defaultH: 5,
  },
  exams: { title: 'Exams', description: 'Countdown to the next exam, and the rest', minW: 3, minH: 3, defaultW: 4, defaultH: 4 },
  lectures: { title: 'Upcoming lectures', description: 'Times, rooms and teaching weeks', minW: 3, minH: 3, defaultW: 4, defaultH: 4 },
  grades: {
    title: 'Grade breakdown',
    description: "Each assignment's share of the grade, and what you need for a target",
    minW: 4,
    minH: 4,
    defaultW: 6,
    defaultH: 6,
  },
  openTodos: {
    title: 'Assignment to-dos',
    description: 'Unticked checklist items from every assignment',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
  },
  todo: { title: 'To-do', description: "This module's own checklist", minW: 2, minH: 3, defaultW: 3, defaultH: 5 },
  notepad: { title: 'Notepad', description: 'Scratch space for this module', minW: 2, minH: 3, defaultW: 3, defaultH: 5 },
  related: { title: 'Related modules', description: 'Modules linked to this one', minW: 3, minH: 2, defaultW: 12, defaultH: 2 },
}

/** The page as it was before it was customisable: Schedule on top of three lists. */
export const MODULE_DEFAULT_LAYOUT: LayoutItem<ModuleWidgetId>[] = [
  { i: 'schedule', x: 0, y: 0, w: 12, h: 5 },
  { i: 'submodules', x: 0, y: 5, w: 4, h: 9 },
  { i: 'assignments', x: 4, y: 5, w: 4, h: 9 },
  { i: 'flashcards', x: 8, y: 5, w: 4, h: 9 },
]

export const MODULE_BOARD: Board<ModuleWidgetId> = { widgets: MODULE_WIDGETS, defaultLayout: MODULE_DEFAULT_LAYOUT }

/**
 * The module board with the user's default layout (AppSettings.default_module_layout) as the one
 * uncustomised modules show and Reset returns to. Null or unusable: the built-in default.
 */
export function moduleBoard(userDefault: unknown): Board<ModuleWidgetId> {
  if (userDefault == null) return MODULE_BOARD
  return { widgets: MODULE_WIDGETS, defaultLayout: normalizeLayout(MODULE_BOARD, userDefault) }
}

/** Starting points offered by the setup page, all within the 12 × 14 board. */
export const MODULE_LAYOUT_PRESETS: { id: string; label: string; description: string; layout: LayoutItem<ModuleWidgetId>[] }[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'The week ahead, then topics, assignments and flashcards side by side.',
    layout: MODULE_DEFAULT_LAYOUT,
  },
  {
    id: 'revision',
    label: 'Revision',
    description: 'Flashcards and revision sessions up front, with exam countdowns.',
    layout: [
      { i: 'schedule', x: 0, y: 0, w: 8, h: 5 },
      { i: 'exams', x: 8, y: 0, w: 4, h: 5 },
      { i: 'flashcards', x: 0, y: 5, w: 4, h: 9 },
      { i: 'revision', x: 4, y: 5, w: 4, h: 9 },
      { i: 'submodules', x: 8, y: 5, w: 4, h: 9 },
    ],
  },
  {
    id: 'deadlines',
    label: 'Deadlines',
    description: 'Assignments, their open to-dos and the grade breakdown.',
    layout: [
      { i: 'schedule', x: 0, y: 0, w: 12, h: 5 },
      { i: 'assignments', x: 0, y: 5, w: 4, h: 9 },
      { i: 'openTodos', x: 4, y: 5, w: 4, h: 9 },
      { i: 'grades', x: 8, y: 5, w: 4, h: 9 },
    ],
  },
  {
    id: 'notes',
    label: 'Notes first',
    description: 'A tall list of topics, with flashcards and assignments beside it.',
    layout: [
      { i: 'submodules', x: 0, y: 0, w: 6, h: 14 },
      { i: 'flashcards', x: 6, y: 0, w: 6, h: 7 },
      { i: 'assignments', x: 6, y: 7, w: 6, h: 7 },
    ],
  },
]
