import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react'

import { ArrowLeftRight, GripVertical, Settings2, X } from 'lucide-react'
import { motion } from 'motion/react'

import { useTileControls, type TileControls } from '@/components/dashboard/tileControls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Direction } from '@/lib/dashboardLayout'
import { fadeUpAt } from '@/lib/motion'

const MotionCard = motion.create(Card)

/** What a board shows for one widget type: shared by a page and its setup preview. */
export interface WidgetContent {
  body: ReactNode
  /** Extra header content on the right, hidden while editing. */
  action?: ReactNode
  /** False for a body that fits itself to the widget (like a ring) and should never scroll. */
  scroll?: boolean
  /**
   * The settings form for a widget with `WidgetInfo.config`, shown from the ⚙ while editing. It
   * reads and edits its copy's settings with `useWidgetConfig`.
   */
  settings?: ReactNode
}

/** Grid items with this class drag by it (`dragConfig.handle`). */
export const DRAG_HANDLE_CLASS = 'widget-drag-handle'
/** Marks the grip, the one button in the header that still starts a drag. */
export const DRAG_GRIP_ATTRIBUTE = 'data-drag-grip'

const ARROWS: Record<string, Direction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/** Keep a press on a header button from starting a drag on the header it sits in. */
const stopDrag = {
  onPointerDown: (e: SyntheticEvent) => e.stopPropagation(),
  onMouseDown: (e: SyntheticEvent) => e.stopPropagation(),
}

/**
 * The header grip while editing: drag it like the rest of the header, or focus it and use the
 * arrow keys to swap the widget with a neighbour. Shift + arrows grow it that way, Ctrl + Shift +
 * arrows shrink it from that side.
 */
function Grip({ title, controls }: { title: string; controls: TileControls }) {
  function onKeyDown(e: KeyboardEvent) {
    const dir = ARROWS[e.key]
    if (!dir) return
    e.preventDefault()
    if (e.shiftKey) controls.resize(dir, e.ctrlKey || e.metaKey ? 'shrink' : 'grow')
    else controls.move(dir)
  }
  return (
    <button
      type="button"
      {...{ [DRAG_GRIP_ATTRIBUTE]: '' }}
      aria-label={`Move ${title}`}
      aria-description="Arrow keys swap it with the widget that way. Shift and an arrow key grow it that way; Ctrl, Shift and an arrow key shrink it from that side."
      title="Drag, or focus and use the arrow keys (Shift to grow, Ctrl+Shift to shrink)"
      onKeyDown={onKeyDown}
      className="-ml-1 shrink-0 cursor-grab rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  )
}

/** The "Swap with…" menu while editing: the other widgets, greyed out where a swap won't fit. */
function SwapMenu({ title, controls }: { title: string; controls: TileControls }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Swap ${title} with…`} title="Swap with…" {...stopDrag} className="-my-1">
          <ArrowLeftRight />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Swap with</DropdownMenuLabel>
        {controls.swapOptions().map((option) => (
          <DropdownMenuItem key={option.id} disabled={!option.fits} onSelect={() => controls.swapWith(option.id)}>
            <span className="min-w-0 flex-1 truncate">{option.title}</span>
            {!option.fits && <span className="text-xs text-muted-foreground">Won’t fit</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The ⚙ while editing: the widget's settings form in a popover. Changes go into the layout draft. */
function SettingsPopover({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`${title} settings`} title="Settings" {...stopDrag} className="-my-1">
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="text-sm font-medium">{title} settings</p>
        <div className="mt-3">{children}</div>
        <p className="mt-3 text-xs text-muted-foreground">Saved with the layout when you press Done.</p>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The card every Overview widget sits in. It fills its grid cell; the body scrolls inside it and
 * is a size container, so widgets adapt with `@md:`-style container queries rather than viewport
 * breakpoints. In edit mode the header is the drag handle and the body is inert: no pointer, no
 * focus, no typing. A drag can't pick a calendar day, and Tab only reaches the header's controls,
 * never the to-do box.
 */
export function DashboardWidget({
  title,
  slot,
  editing,
  onRemove,
  action,
  bodyClassName = '',
  scroll = true,
  settings,
  children,
}: {
  title: string
  /** Entrance order, so widgets fade in one after another. */
  slot: number
  editing: boolean
  onRemove: () => void
  /** Extra header content on the right, hidden while editing. */
  action?: ReactNode
  bodyClassName?: string
  /** False for a body that fits itself to the widget (like a ring) and should never scroll. */
  scroll?: boolean
  /** The widget's settings form (`WidgetContent.settings`), behind a ⚙ while editing. */
  settings?: ReactNode
  children: ReactNode
}) {
  const controls = useTileControls()
  return (
    <MotionCard
      className={`h-full ${editing ? 'outline-2 outline-offset-2 outline-ring/60 outline-dashed' : ''}`}
      variants={fadeUpAt}
      custom={slot}
      initial="hidden"
      animate="shown"
    >
      <CardHeader
        className={`flex items-center gap-2 ${editing ? `${DRAG_HANDLE_CLASS} cursor-grab select-none active:cursor-grabbing` : ''}`}
      >
        {editing &&
          (controls ? (
            <Grip title={title} controls={controls} />
          ) : (
            <GripVertical className="-ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
          ))}
        <CardTitle className="min-w-0 flex-1 truncate">{title}</CardTitle>
        {editing && settings && <SettingsPopover title={title}>{settings}</SettingsPopover>}
        {editing && controls && <SwapMenu title={title} controls={controls} />}
        {editing ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${title}`}
            title={`Remove ${title}`}
            {...stopDrag}
            onClick={onRemove}
            className="-my-1 -mr-1"
          >
            <X />
          </Button>
        ) : (
          action
        )}
      </CardHeader>
      <CardContent
        inert={editing}
        className={`@container flex min-h-0 flex-1 flex-col ${scroll ? 'overflow-y-auto' : 'overflow-hidden'} ${editing ? 'select-none' : ''} ${bodyClassName}`}
      >
        {children}
      </CardContent>
    </MotionCard>
  )
}
