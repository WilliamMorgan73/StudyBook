import type { ReactNode } from 'react'

import { WindowControls } from '@/components/WindowControls'
import { isDesktop } from '@/lib/desktop'
import { cn } from '@/lib/utils'

/**
 * The bar across the top of every page. In the desktop shell it also stands in for the OS title bar:
 * dragging any non-interactive part moves the window, double-clicking maximises, and the window
 * controls sit at its right end.
 */
export function PageHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header
      data-tauri-drag-region="deep"
      className={cn('flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-card px-6', isDesktop && 'pr-3')}
    >
      <div className="flex min-w-0 items-center gap-3">{left}</div>
      {(right || isDesktop) && (
        <div className="flex shrink-0 items-center gap-2">
          {right}
          <WindowControls className={cn(right && 'ml-1 border-l pl-2')} />
        </div>
      )}
    </header>
  )
}
