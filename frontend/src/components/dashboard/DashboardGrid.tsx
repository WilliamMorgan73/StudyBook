import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'

import ReactGridLayout, {
  bottom,
  cloneLayout,
  getLayoutItem,
  moveElement,
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
  cellAt,
  fitRowHeight,
  stackedOrder,
  swapTiles,
  tileAt,
  widgetHeight,
  type LayoutItem,
  type WidgetInfo,
} from '@/lib/dashboardLayout'
import { useElementSize } from '@/lib/useElementSize'

/** Narrower than this (px of page content), widgets stack in one column at their grid heights. */
const STACK_BELOW = 900

function sameWidgets(a: Layout, b: Layout): boolean {
  return a.length === b.length && a.every((item) => b.some((other) => other.i === item.i))
}

/** The drag in progress, and the widget it would swap with if dropped now. */
interface DragSession {
  id: string
  /** The layout when the drag began. */
  start: Layout
  /** The widget under the pointer (on `start`), if any. */
  target: string | null
  /** `start` with the dragged widget and the target swapped; null if that doesn't fit the board. */
  swapped: Layout | null
  /** The pointer has just left the target, so the next step restarts from `start`. */
  leftSwap: boolean
}

/** Where a mouse or touch event happened, in viewport px. */
function clientPoint(e: Event): { x: number; y: number } | null {
  if ('touches' in e) {
    const touch = (e as TouchEvent).touches[0] ?? (e as TouchEvent).changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  return 'clientX' in e ? { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY } : null
}

/**
 * The usual compactor (widgets float up, and push each other out of the way), except that a move
 * which would push a widget off the bottom of the board is refused: the layout stays as it was
 * before that step of the drag or resize. While the dragged widget is over another one, the board
 * shows the two swapped instead (or the layout from before the drag, if the swap won't fit), and
 * that's what a drop there keeps.
 */
function useBoardCompactor(dragRef: RefObject<DragSession | null>): Compactor {
  const lastFit = useRef<Layout | null>(null)
  return useMemo(
    () => ({
      ...verticalCompactor,
      compact(layout, cols) {
        const drag = dragRef.current
        if (drag?.target) {
          lastFit.current = cloneLayout(drag.swapped ?? drag.start)
          return cloneLayout(lastFit.current)
        }
        if (drag?.leftSwap) {
          // The grid moved the widget from the swap preview; move it from the original layout instead.
          drag.leftSwap = false
          const moved = getLayoutItem(layout, drag.id)
          const base = cloneLayout(drag.start)
          const item = getLayoutItem(base, drag.id)
          if (moved && item) layout = moveElement(base, item, moved.x, moved.y, true, false, 'vertical', cols)
          lastFit.current = cloneLayout(drag.start)
        }
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
    [dragRef],
  )
}

/**
 * Lays the widgets out on a board DASHBOARD_COLUMNS wide and DASHBOARD_ROWS tall, stretched to fill
 * the height it's given (it scrolls only if rows would get shorter than the minimum, or when
 * stacked). While `editing`, widgets drag by their header and resize from their right edge, bottom
 * edge or corner, never past the board's edges, and every move reports the new layout.
 */
export function DashboardGrid<Id extends string>({
  widgets,
  layout,
  editing,
  onLayoutChange,
  renderWidget,
}: {
  /** The board's widget registry, for each widget's minimum size. */
  widgets: Record<Id, WidgetInfo>
  layout: LayoutItem<Id>[]
  editing: boolean
  onLayoutChange: (layout: LayoutItem<Id>[]) => void
  renderWidget: (id: Id, slot: number) => ReactNode
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const [scrollerRef, { height }] = useElementSize<HTMLDivElement>()
  const dragRef = useRef<DragSession | null>(null)
  const compactor = useBoardCompactor(dragRef)
  // The widget being dragged, the one a drop would swap it with, and whether that swap fits: the
  // target is outlined, and the dragged widget (always in view) says when it won't fit.
  const [swapHint, setSwapHint] = useState<{ id: string; target: string; fits: boolean } | null>(null)
  const stacked = mounted && width < STACK_BELOW
  // Entrance order follows reading order, whichever way the widgets are laid out.
  const order = stackedOrder(layout)
  const rowHeight = fitRowHeight(height)

  function onDrag(e: Event) {
    const drag = dragRef.current
    const point = clientPoint(e)
    const grid = containerRef.current?.getBoundingClientRect()
    if (!drag || !point || !grid) return
    // Hit-tested against the layout from before the drag, since the swap preview moves the target
    // out from under the pointer.
    const { col, row } = cellAt(point.x - grid.left, point.y - grid.top, width, rowHeight)
    const target = tileAt(drag.start, col, row, drag.id)
    if (target === drag.target) return
    if (drag.target && !target) drag.leftSwap = true
    drag.target = target
    const swapped = target ? swapTiles(drag.start, drag.id, target) : null
    drag.swapped = swapped && drag.start.map((item) => ({ ...item, ...getLayoutItem(swapped, item.i) }))
    setSwapHint(target ? { id: drag.id, target, fits: swapped !== null } : null)
  }

  function endDrag() {
    dragRef.current = null
    setSwapHint(null)
  }

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
              layout={layout.map((item) => ({ ...item, minW: widgets[item.i].minW, minH: widgets[item.i].minH }))}
              gridConfig={{
                cols: DASHBOARD_COLUMNS,
                rowHeight,
                maxRows: DASHBOARD_ROWS,
                margin: [DASHBOARD_MARGIN, DASHBOARD_MARGIN],
                containerPadding: [DASHBOARD_MARGIN, DASHBOARD_MARGIN],
              }}
              compactor={compactor}
              dragConfig={{ enabled: editing, bounded: true, handle: `.${DRAG_HANDLE_CLASS}`, cancel: 'button' }}
              resizeConfig={{ enabled: editing, handles: ['e', 's', 'se'] }}
              onDragStart={(current, item) => {
                if (item) dragRef.current = { id: item.i, start: cloneLayout(current), target: null, swapped: null, leftSwap: false }
              }}
              onDrag={(_layout, _old, _item, _placeholder, e) => onDrag(e)}
              onDragStop={endDrag}
              onLayoutChange={(next: Layout) => {
                if (editing) onLayoutChange(next.map(({ i, x, y, w, h }) => ({ i: i as Id, x, y, w, h })))
              }}
              className="dashboard-grid"
            >
              {layout.map((item) => {
                const target = swapHint?.target === item.i
                const wontFit = swapHint?.id === item.i && !swapHint.fits
                return (
                  <div
                    key={item.i}
                    className={target ? `rounded-xl ring-2 ${swapHint.fits ? 'ring-primary' : 'ring-destructive'}` : undefined}
                  >
                    {renderWidget(item.i, order.indexOf(item))}
                    {wontFit && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-white shadow">
                          Won’t fit
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </ReactGridLayout>
          ))}
      </div>
    </div>
  )
}
