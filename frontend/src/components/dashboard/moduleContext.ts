import { createContext, useContext } from 'react'

import type { ModuleDetail, RevisionSession } from '@/lib/api'
import type { AsyncState } from '@/lib/useAsync'

/** What ModulePage fetches once and every module widget can read. */
export interface ModuleData {
  module: ModuleDetail
  refetch: () => Promise<void>
  /** This week's revision sessions, for the Schedule widget. */
  weekSessions: AsyncState<RevisionSession[]>
  /** Revision sessions from today on, for the Upcoming revision widget. */
  upcomingSessions: AsyncState<RevisionSession[]>
  /** Marks a revision session done (or not) and refreshes both session lists. */
  setRevisionDone: (session: RevisionSession, done: boolean) => Promise<void>
  /** The day picked on the Schedule, which the Day agenda shows. */
  selectedDay: Date
  setSelectedDay: (day: Date) => void
  /** The Day agenda widget is placed, so the Schedule leaves its day list out. */
  dayAgendaPlaced: boolean
}

export const ModuleContext = createContext<ModuleData | null>(null)

export function useModuleData(): ModuleData {
  const value = useContext(ModuleContext)
  if (value === null) throw new Error('useModuleData must be used inside ModuleContext')
  return value
}
