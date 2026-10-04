import { Minus, Square, X } from 'lucide-react'

import { desktopWindow, isDesktop } from '@/lib/desktop'
import { cn } from '@/lib/utils'

/**
 * Minimise / maximise / close for the frameless desktop window, at the right end of each header.
 * Renders nothing in a browser.
 */
export function WindowControls({ className }: { className?: string }) {
  if (!isDesktop) return null
  const button =
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <button type="button" aria-label="Minimise window" className={button} onClick={desktopWindow.minimize}>
        <Minus className="size-4" />
      </button>
      <button type="button" aria-label="Maximise window" className={button} onClick={desktopWindow.toggleMaximize}>
        <Square className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close window"
        className={cn(button, 'hover:bg-destructive hover:text-white')}
        onClick={desktopWindow.close}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

/** A bare draggable header with only the window controls, for desktop screens that have no header of their own. */
export function DesktopTitleBar() {
  if (!isDesktop) return null
  return (
    <header data-tauri-drag-region="deep" className="flex h-12 shrink-0 items-center justify-end px-3">
      <WindowControls />
    </header>
  )
}
