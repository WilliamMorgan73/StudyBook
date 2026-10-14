// Settings for the selected day's list that the Overview Calendar and the module Schedule show
// when the Day agenda widget isn't placed (#113): whether it shows, and how much room it gets.

import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

export type DayListSize = 'sm' | 'md' | 'lg'

export interface DayListConfig extends Record<string, unknown> {
  dayList: boolean
  dayListSize: DayListSize
}

/** The look before these settings existed: shown, at the medium size. */
export const DAY_LIST_DEFAULT: DayListConfig = { dayList: true, dayListSize: 'md' }

export const DAY_LIST_SIZES: { value: DayListSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
]

export const DAY_LIST_CONFIG: WidgetConfigSpec<DayListConfig> = {
  normalize(raw) {
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    return {
      dayList: typeof r.dayList === 'boolean' ? r.dayList : DAY_LIST_DEFAULT.dayList,
      dayListSize: r.dayListSize === 'sm' || r.dayListSize === 'lg' ? r.dayListSize : DAY_LIST_DEFAULT.dayListSize,
    }
  },
}
