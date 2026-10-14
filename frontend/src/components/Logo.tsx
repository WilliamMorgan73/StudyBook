import { BookOpen } from 'lucide-react'

import { cn } from '@/lib/utils'

/** The StudyBook mark: the same tile as the favicon and desktop icons (`src-tauri/icons/logo.svg`), in theme colours. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-[23%] bg-primary text-primary-foreground',
        className,
      )}
    >
      <BookOpen className="size-[65%]" strokeWidth={2.5} />
    </span>
  )
}
