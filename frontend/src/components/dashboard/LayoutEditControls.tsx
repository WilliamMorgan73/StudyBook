import type { ReactNode } from 'react'

import { Check, LayoutDashboard, Plus, RotateCcw } from 'lucide-react'

import type { LayoutEditor } from '@/components/dashboard/useLayoutEditor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { sameLayout } from '@/lib/dashboardLayout'

/**
 * Page-header buttons for a dashboard board: "Edit layout" (then `children`, the page's other
 * buttons) normally; Add widget, Reset, Cancel and Done while editing.
 */
export function LayoutEditControls<Id extends string>({
  editor,
  menuLabel,
  disabled = false,
  editingActions,
  children,
}: {
  editor: LayoutEditor<Id>
  /** Heading of the "Add widget" menu. */
  menuLabel: string
  /** Disables "Edit layout", e.g. while the saved layout is still loading. */
  disabled?: boolean
  children?: ReactNode
  /** Extra buttons shown while editing, before Reset. */
  editingActions?: ReactNode
}) {
  const { board, layout, hidden, saving } = editor

  if (!editor.editing) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={editor.start} disabled={disabled}>
          <LayoutDashboard /> Edit layout
        </Button>
        {children}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {editor.saveError && <span className="text-sm text-destructive">{editor.saveError}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={hidden.length === 0}>
            <Plus /> Add widget
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
          {hidden.map((id) => {
            const fits = editor.canAdd(id)
            return (
              <DropdownMenuItem
                key={id}
                disabled={!fits}
                onSelect={() => editor.add(id)}
                className="flex-col items-start gap-0"
              >
                <span>{board.widgets[id].title}</span>
                <span className="text-xs text-muted-foreground">
                  {fits ? board.widgets[id].description : 'No room left. Shrink or remove a widget first.'}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {editingActions}
      <Button variant="ghost" size="sm" onClick={editor.reset} disabled={sameLayout(layout, board.defaultLayout)}>
        <RotateCcw /> Reset
      </Button>
      <Button variant="ghost" size="sm" onClick={editor.cancel} disabled={saving}>
        Cancel
      </Button>
      <Button
        size="sm"
        onClick={editor.save}
        // An empty layout would load back as the default, so ask for at least one widget.
        disabled={saving || layout.length === 0}
      >
        <Check /> Done
      </Button>
    </div>
  )
}
