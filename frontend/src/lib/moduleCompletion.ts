// Completed modules (#135): a module can be marked completed, which labels it and lets each Modules
// widget list open modules, completed ones, or both.

import type { WidgetConfigSpec } from '@/lib/dashboardLayout'

export type ModulesShown = 'open' | 'completed' | 'both'

export const MODULES_SHOWN_LABELS: Record<ModulesShown, string> = {
  open: 'Open modules',
  completed: 'Completed modules',
  both: 'Open and completed',
}

export interface ModulesWidgetConfig extends Record<string, unknown> {
  show: ModulesShown
}

export const MODULES_WIDGET_DEFAULT: ModulesWidgetConfig = { show: 'both' }

export const MODULES_WIDGET_CONFIG: WidgetConfigSpec<ModulesWidgetConfig> = {
  normalize(raw) {
    const show = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).show : undefined
    return { show: show === 'open' || show === 'completed' ? show : 'both' }
  },
}

export function filterModules<M extends { completed_at: string | null }>(modules: M[], show: ModulesShown): M[] {
  if (show === 'both') return modules
  return modules.filter((m) => (m.completed_at !== null) === (show === 'completed'))
}

/** "Completed Jun 2026". */
export function completedLabel(completedAt: string) {
  const date = new Date(completedAt)
  if (Number.isNaN(date.getTime())) return 'Completed'
  return `Completed ${date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
}
