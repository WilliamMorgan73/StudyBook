import { createContext, useContext } from 'react'

import type { WidgetConfig, WidgetConfigSpec } from '@/lib/dashboardLayout'

/**
 * The widget being rendered: its instance id and its own settings. `DashboardGrid` provides one per
 * widget, so a body (and its settings form) can tell its copy apart from other copies of the same
 * widget. `setConfig` edits the layout draft, so it only takes effect while editing.
 */
export interface WidgetInstance {
  id: string
  /** As stored; read it through the widget's `normalize` (see `useWidgetConfig`). */
  config: WidgetConfig
  setConfig: (config: WidgetConfig) => void
}

export const WidgetInstanceContext = createContext<WidgetInstance | null>(null)

export function useWidgetInstance(): WidgetInstance {
  const instance = useContext(WidgetInstanceContext)
  if (!instance) throw new Error('useWidgetInstance must be used inside a DashboardGrid widget')
  return instance
}

/** This widget's settings, shaped by its spec, and a setter that edits them in the layout draft. */
export function useWidgetConfig<C extends WidgetConfig>(spec: WidgetConfigSpec<C>): [C, (config: C) => void] {
  const { config, setConfig } = useWidgetInstance()
  return [spec.normalize(config), setConfig]
}
