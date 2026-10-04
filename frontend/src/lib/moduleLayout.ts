// The module page's board: its widget registry and default layout, saved per module as
// `modules.dashboard_layout` (null = MODULE_DEFAULT_LAYOUT). See `lib/dashboardLayout.ts`.

import type { Board, LayoutItem, WidgetInfo } from '@/lib/dashboardLayout'

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
