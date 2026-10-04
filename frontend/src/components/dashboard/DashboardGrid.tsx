import { useMemo, useRef, type ReactNode } from 'react'

import ReactGridLayout, {
  bottom,
  cloneLayout,
  useContainerWidth,
  verticalCompactor,
  type Compactor,
  type Layout,
} from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

import { DRAG_HANDLE_CLASS } from '@/components/dashboard/DashboardWidget'
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_MARGIN,
  DASHBOARD_ROWS,
  fitRowHeight,
  stackedOrder,
  widgetHeight,
  WIDGETS,
  type LayoutItem,
  type WidgetId,
} from '@/lib/dashboardLayout'
import { useElementSize } from '@/lib/useElementSize'

/** Narrower than this (px of page content), widgets stack in one column at their grid heights. */
const STACK_BELOW = 900

function sameWidgets(a: Layout, b: Layout): boolean {
  return a.length === b.length && a.every((item) => b.some((other) => other.i === item.i))
}

/**
 * The usual compactor (widgets float up, and push each other out of the way), except that a move
 * which would push a widget off the bottom of the board is refused: the layout stays as it was
 * before that step of the drag or resize.
 */
function useBoardCompactor(): Compactor {
  const lastFit = useRef<Layout | null>(null)
  return useMemo(
    () => ({
      ...verticalCompactor,
      compact(layout, cols) {
        const out = verticalCompactor.compact(layout, cols)
        const previous = lastFit.current
        if (bottom(out) <= DASHBOARD_ROWS) {
          // Cloned both ways, since the grid moves items in place while dragging.
          lastFit.current = cloneLayout(out)
          return out
        }
        // An overflowing layout with different widgets isn't a refused move (it's a widget added
        // or removed), so it passes through.
        return previous && sameWidgets(previous, out) ? cloneLayout(previous) : out
      },
    }),
    [],
  )
}

/**
 * Lays the widgets out on a board DASHBOARD_COLUMNS wide and DASHBOARD_ROWS tall, stretched to fill
 * the height it's given (it scrolls only if rows would get shorter than the minimum, or when
 * stacked). While `editing`, widgets drag by their header and resize from their right edge, bottom
 * edge or corner, never past the board's edges, and every move reports the new layout.
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
  const [scrollerRef, { height }] = useElementSize<HTMLDivElement>()
  const compactor = useBoardCompactor()
  const stacked = mounted && width < STACK_BELOW
  // Entrance order follows reading order, whichever way the widgets are laid out.
  const order = stackedOrder(layout)

  return (
    // Bleeds into the page padding by one grid margin, so the grid's own padding lines up with it.
    // The tint while editing marks the board's edges.
    <div
      ref={scrollerRef}
      className={`-m-4 h-[calc(100%+2rem)] overflow-y-auto rounded-2xl transition-colors ${editing ? 'bg-muted/50' : ''}`}
    >
      <div ref={containerRef}>
        {mounted &&
          height > 0 &&
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
                rowHeight: fitRowHeight(height),
                maxRows: DASHBOARD_ROWS,
                margin: [DASHBOARD_MARGIN, DASHBOARD_MARGIN],
                containerPadding: [DASHBOARD_MARGIN, DASHBOARD_MARGIN],
              }}
              compactor={compactor}
              dragConfig={{ enabled: editing, bounded: true, handle: `.${DRAG_HANDLE_CLASS}`, cancel: 'button' }}
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
    </div>
  )
}
