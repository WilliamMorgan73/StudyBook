// The Card of the day widget's settings (#96): due cards from every module, or from one.

import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

export interface CardOfTheDayConfig extends Record<string, unknown> {
  /** Null: every module. */
  moduleId: number | null
}

export const CARD_OF_THE_DAY_CONFIG: WidgetConfigSpec<CardOfTheDayConfig> = {
  normalize(raw) {
    const id = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).moduleId : undefined
    return { moduleId: typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null }
  },
}
