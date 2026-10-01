import type { ReactNode } from 'react'

import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

import { DRAG_HANDLE_CLASS } from '@/components/dashboard/DashboardWidget'
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_MARGIN,
  DASHBOARD_ROW_HEIGHT,
  stackedOrder,
  widgetHeight,
  WIDGETS,
  type LayoutItem,
  type WidgetId,
} from '@/lib/dashboardLayout'

/** Narrower than this (px of page content), widgets stack in one column at their grid heights. */
const STACK_BELOW = 900

/**
 * Lays the widgets out on the 12-column grid. While `editing`, they drag by their header and
 * resize from their right edge, bottom edge or corner, and every move reports the new layout.
 */
export function DashboardGrid({
  layout,
  editing,
  onLayoutChange,
  renderWidget,
}: {
  layout: LayoutItem[]
  editing: boolean
  onLayoutChange: (layout: LayoutItem[]) => void
  renderWidget: (id: WidgetId, slot: number) => ReactNode
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const stacked = mounted && width < STACK_BELOW
  // Entrance order follows reading order, whichever way the widgets are laid out.
  const order = stackedOrder(layout)

  return (
    <div ref={containerRef} className={`-m-6 rounded-2xl transition-colors ${editing ? 'bg-muted/50' : ''}`}>
      {mounted &&
        (stacked ? (
          <div className="flex flex-col gap-6 p-6">
            {order.map((item, slot) => (
              <div key={item.i} style={{ height: widgetHeight(item.h) }}>
                {renderWidget(item.i, slot)}
              </div>
            ))}
          </div>
        ) : (
          <ReactGridLayout
            width={width}
            layout={layout.map((item) => ({ ...item, minW: WIDGETS[item.i].minW, minH: WIDGETS[item.i].minH }))}
            gridConfig={{
              cols: DASHBOARD_COLUMNS,
              rowHeight: DASHBOARD_ROW_HEIGHT,
              margin: [DASHBOARD_MARGIN, DASHBOARD_MARGIN],
              containerPadding: [DASHBOARD_MARGIN, DASHBOARD_MARGIN],
            }}
            dragConfig={{ enabled: editing, handle: `.${DRAG_HANDLE_CLASS}`, cancel: 'button' }}
            resizeConfig={{ enabled: editing, handles: ['e', 's', 'se'] }}
            onLayoutChange={(next: Layout) => {
              if (editing) onLayoutChange(next.map(({ i, x, y, w, h }) => ({ i: i as WidgetId, x, y, w, h })))
            }}
            className="dashboard-grid"
          >
            {layout.map((item) => (
              <div key={item.i}>{renderWidget(item.i, order.indexOf(item))}</div>
            ))}
          </ReactGridLayout>
        ))}
    </div>
  )
}
