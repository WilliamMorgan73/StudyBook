import type { ReactNode } from 'react'

import {
  AssignmentsAction,
  AssignmentsWidget,
  DayAgendaWidget,
  ExamsWidget,
  FlashcardsAction,
  FlashcardsWidget,
  GradesWidget,
  LecturesWidget,
  ModuleNotepadWidget,
  ModuleProgressWidget,
  ModuleTodoWidget,
  OpenTodosWidget,
  RelatedModulesWidget,
  RevisionWidget,
  ScheduleWidget,
  SubmodulesAction,
  SubmodulesWidget,
} from '@/components/dashboard/ModuleWidgets'
import type { ModuleWidgetId } from '@/lib/moduleLayout'

/** Each module-page widget's body, header action and scrolling; shared by the page and its preview. */
export const MODULE_WIDGET_CONTENT: Record<ModuleWidgetId, { body: ReactNode; action?: ReactNode; scroll?: boolean }> = {
  schedule: { body: <ScheduleWidget /> },
  dayAgenda: { body: <DayAgendaWidget /> },
  submodules: { body: <SubmodulesWidget />, action: <SubmodulesAction /> },
  assignments: { body: <AssignmentsWidget />, action: <AssignmentsAction /> },
  flashcards: { body: <FlashcardsWidget />, action: <FlashcardsAction /> },
  revision: { body: <RevisionWidget /> },
  // The ring sizes itself to the widget, dropping its legend and caption when they don't fit.
  progress: { body: <ModuleProgressWidget />, scroll: false },
  exams: { body: <ExamsWidget /> },
  lectures: { body: <LecturesWidget /> },
  grades: { body: <GradesWidget /> },
  openTodos: { body: <OpenTodosWidget /> },
  todo: { body: <ModuleTodoWidget /> },
  notepad: { body: <ModuleNotepadWidget /> },
  related: { body: <RelatedModulesWidget /> },
}
