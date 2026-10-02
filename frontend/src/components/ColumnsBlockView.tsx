import { MarkdownView } from '@/components/MarkdownView'

/**
 * A `:::columns` block: main text beside a titled side box, stacked when the note column is
 * narrow (a container query, since the editor's width isn't the viewport's).
 */
export function ColumnsBlockView({ main, sideTitle, side }: { main: string; sideTitle: string; side: string }) {
  return (
    <div className="@container py-3">
      <div className="grid gap-4 @md:grid-cols-[2fr_1fr] @md:items-start">
        <MarkdownView className="text-[length:inherit] [&>:first-child]:mt-0">{main}</MarkdownView>
        <aside className="note-side-box">
          {sideTitle && <p className="mb-1.5 text-sm font-semibold">{sideTitle}</p>}
          <MarkdownView className="prose-sm [&>:first-child]:mt-0 [&>:last-child]:mb-0">{side}</MarkdownView>
        </aside>
      </div>
    </div>
  )
}
