import type { ReactNode } from 'react'

export function PageHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b bg-card px-8 py-4">
      <div className="flex min-w-0 items-center gap-3">{left}</div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  )
}
