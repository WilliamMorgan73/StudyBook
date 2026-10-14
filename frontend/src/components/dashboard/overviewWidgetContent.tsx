import { AgendaWidget, CalendarWidget } from '@/components/dashboard/CalendarWidget'
import { ClockSettings, ClockWidget } from '@/components/dashboard/ClockWidget'
import type { WidgetContent } from '@/components/dashboard/DashboardWidget'
import { GradeTargetSettings, GradeTargetWidget } from '@/components/dashboard/GradeTargetWidget'
import { CalendarSettings } from '@/components/dashboard/DayListSettings'
import {
  FlashcardsDueWidget,
  ModulesWidget,
  RevisionTodayWidget,
  TodoWidget,
  UpcomingWidget,
} from '@/components/dashboard/ListWidgets'
import { NowWidget } from '@/components/dashboard/NowWidget'
import { PinnedSettings, PinnedWidget } from '@/components/dashboard/PinnedWidget'
import { ProgressWidget } from '@/components/dashboard/ProgressWidget'
import { TimelineSettings, TimelineWidget } from '@/components/dashboard/TimelineWidget'
import { QuickNotepad } from '@/components/QuickNotepad'
import type { WidgetId } from '@/lib/dashboardLayout'

/**
 * Each Overview widget's body, scrolling and settings form (for widgets with `WidgetInfo.config`);
 * shared by the Overview and its preview.
 */
export const OVERVIEW_WIDGET_CONTENT: Record<WidgetId, WidgetContent> = {
  calendar: { body: <CalendarWidget />, settings: <CalendarSettings /> },
  agenda: { body: <AgendaWidget /> },
  upcoming: { body: <UpcomingWidget /> },
  todo: { body: <TodoWidget /> },
  // The ring sizes itself to the widget, dropping its legend and caption when they don't fit.
  progress: { body: <ProgressWidget />, scroll: false },
  notepad: { body: <QuickNotepad /> },
  modules: { body: <ModulesWidget /> },
  revisionToday: { body: <RevisionTodayWidget /> },
  flashcardsDue: { body: <FlashcardsDueWidget /> },
  // Sizes itself to the widget, like the ring.
  clock: { body: <ClockWidget />, scroll: false, settings: <ClockSettings /> },
  timeline: { body: <TimelineWidget />, settings: <TimelineSettings /> },
  gradeTarget: { body: <GradeTargetWidget />, settings: <GradeTargetSettings /> },
  pinned: { body: <PinnedWidget />, settings: <PinnedSettings /> },
  now: { body: <NowWidget /> },
}
