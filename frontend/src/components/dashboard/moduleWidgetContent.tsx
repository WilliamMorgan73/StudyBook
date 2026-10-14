import { ClockSettings, ClockWidget } from '@/components/dashboard/ClockWidget'
import type { WidgetContent } from '@/components/dashboard/DashboardWidget'
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

/**
 * Each module-page widget's body, header action, scrolling and settings form (for widgets with
 * `WidgetInfo.config`); shared by the page and its preview.
 */
export const MODULE_WIDGET_CONTENT: Record<ModuleWidgetId, WidgetContent> = {
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
  // Sizes itself to the widget, like the ring.
  clock: { body: <ClockWidget />, scroll: false, settings: <ClockSettings /> },
}
