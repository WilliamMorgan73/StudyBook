import type { ReactNode } from 'react'

import { AgendaWidget, CalendarWidget } from '@/components/dashboard/CalendarWidget'
import {
  FlashcardsDueWidget,
  ModulesWidget,
  RevisionTodayWidget,
  TodoWidget,
  UpcomingWidget,
} from '@/components/dashboard/ListWidgets'
import { ProgressWidget } from '@/components/dashboard/ProgressWidget'
import { QuickNotepad } from '@/components/QuickNotepad'
import type { WidgetId } from '@/lib/dashboardLayout'

/** Each Overview widget's body; shared by the Overview and its preview. */
export const OVERVIEW_WIDGET_CONTENT: Record<WidgetId, ReactNode> = {
  calendar: <CalendarWidget />,
  agenda: <AgendaWidget />,
  upcoming: <UpcomingWidget />,
  todo: <TodoWidget />,
  progress: <ProgressWidget />,
  notepad: <QuickNotepad />,
  modules: <ModulesWidget />,
  revisionToday: <RevisionTodayWidget />,
  flashcardsDue: <FlashcardsDueWidget />,
}
