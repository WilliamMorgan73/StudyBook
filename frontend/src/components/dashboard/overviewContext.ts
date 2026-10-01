import { createContext, useContext } from 'react'

import type { OverviewCalendar } from '@/components/dashboard/useOverviewCalendar'
import type { AppSettings, ModuleSummary } from '@/lib/api'
import type { AsyncState } from '@/lib/useAsync'

/** What Overview fetches once and every dashboard widget can read. */
export interface OverviewData {
  modules: AsyncState<ModuleSummary[]>
  appSettings: AppSettings | null
  calendar: OverviewCalendar
  /** The Day agenda widget is on the dashboard, so the Calendar widget leaves its day list out. */
  agendaPlaced: boolean
  moduleName: (id: number) => string
  moduleColor: (id: number | null) => string
}

export const OverviewContext = createContext<OverviewData | null>(null)

export function useOverview(): OverviewData {
  const value = useContext(OverviewContext)
  if (value === null) throw new Error('useOverview must be used inside OverviewContext')
  return value
}
