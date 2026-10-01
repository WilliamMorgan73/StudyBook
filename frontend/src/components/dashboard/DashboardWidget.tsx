import type { ReactNode } from 'react'

import { GripVertical, X } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fadeUpAt } from '@/lib/motion'

const MotionCard = motion.create(Card)

/** Grid items with this class drag by it (`dragConfig.handle`). */
export const DRAG_HANDLE_CLASS = 'widget-drag-handle'

/**
 * The card every Overview widget sits in. It fills its grid cell; the body scrolls inside it and
 * is a size container, so widgets adapt with `@md:`-style container queries rather than viewport
 * breakpoints. In edit mode the header is the drag handle and the body ignores the pointer, so a
 * drag can't type into the notepad or pick a calendar day.
 */
export function DashboardWidget({
  title,
  slot,
  editing,
  onRemove,
  action,
  bodyClassName = '',
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
  children: ReactNode
}) {
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
        {editing && <GripVertical className="-ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <CardTitle className="min-w-0 flex-1 truncate">{title}</CardTitle>
        {editing ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${title}`}
            title={`Remove ${title}`}
            // Keep the press from starting a drag on the handle it sits in.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
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
        className={`@container flex min-h-0 flex-1 flex-col overflow-y-auto ${editing ? 'pointer-events-none select-none' : ''} ${bodyClassName}`}
      >
        {children}
      </CardContent>
    </MotionCard>
  )
}
