import type { ComponentProps } from 'react'

import { MarkdownView } from '@/components/MarkdownView'
import { cn } from '@/lib/utils'

/**
 * One face of a flashcard, as the study session shows it, with markdown and math rendered.
 * With `back`, it's the answer side: the question repeated small above the answer.
 */
export function FlashcardFace({
  front,
  back,
  className,
  ...props
}: { front: string; back?: string } & ComponentProps<'div'>) {
  return (
    <div className={cn('min-h-48 rounded-xl border bg-card p-6', back !== undefined && 'space-y-4', className)} {...props}>
      {back === undefined ? (
        <MarkdownView>{front}</MarkdownView>
      ) : (
        <>
          <MarkdownView className="prose-sm opacity-60">{front}</MarkdownView>
          <hr />
          <MarkdownView>{back}</MarkdownView>
        </>
      )}
    </div>
  )
}
