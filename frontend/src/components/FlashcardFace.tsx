import type { ComponentProps } from 'react'

import { MarkdownView } from '@/components/MarkdownView'
import { cn } from '@/lib/utils'

// A one-line answer sits centred under the question; longer ones (lists, display maths, several
// lines) read better left-aligned.
function isShortAnswer(text: string): boolean {
  return text.length <= 140 && !text.includes('\n') && !text.includes('$$')
}

/**
 * One face of a flashcard, with markdown and math rendered. With `back`, it's the answer side: the
 * question repeated small above the answer. `study` is the large session card, with `accent` (the
 * module colour) as its top edge; `compact` is the list-sized card the generator reviews.
 */
export function FlashcardFace({
  front,
  back,
  size = 'compact',
  accent,
  className,
  style,
  ...props
}: { front: string; back?: string; size?: 'compact' | 'study'; accent?: string } & ComponentProps<'div'>) {
  if (size === 'compact') {
    return (
      <div className={cn('min-h-48 rounded-xl border bg-card p-6', back !== undefined && 'space-y-4', className)} style={style} {...props}>
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

  return (
    <div
      className={cn('flex min-h-72 flex-col justify-center rounded-2xl border bg-card px-6 py-10 sm:px-10', className)}
      style={{ borderTop: accent ? `3px solid ${accent}` : undefined, ...style }}
      {...props}
    >
      {back === undefined ? (
        <MarkdownView className="prose-2xl text-center text-balance">{front}</MarkdownView>
      ) : (
        <div className="space-y-5">
          <MarkdownView className="prose-sm text-center text-muted-foreground">{front}</MarkdownView>
          <div className="mx-auto h-px w-16 bg-border" />
          <MarkdownView className={cn('prose-xl', isShortAnswer(back) && 'text-center text-balance')}>{back}</MarkdownView>
        </div>
      )}
    </div>
  )
}
