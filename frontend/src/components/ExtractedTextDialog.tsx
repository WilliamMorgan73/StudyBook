import { TriangleAlert } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { getAttachmentExtractedText, type Attachment } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

/** Shows an Attachment's extracted markdown verbatim: exactly what AI features will receive. */
export function ExtractedTextDialog({
  attachment,
  open,
  onOpenChange,
}: {
  /** Kept set while closing so the content doesn't blank out during the close animation. */
  attachment: Attachment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open && attachment !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">Extracted text · {attachment?.filename}</DialogTitle>
          <DialogDescription>
            Converted locally to markdown. This is exactly what AI features receive for this file.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so switching files refetches; converting happens on the first fetch and is cached. */}
        {attachment && <ExtractedTextBody key={attachment.id} attachmentId={attachment.id} />}
      </DialogContent>
    </Dialog>
  )
}

function ExtractedTextBody({ attachmentId }: { attachmentId: number }) {
  const { data, loading, error } = useAsync(() => getAttachmentExtractedText(attachmentId), [attachmentId])

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Extracting text… the first time can take a few seconds.</p>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">{error?.message ?? 'Could not extract text from this file.'}</p>
  }

  const characters = data.markdown.length
  return (
    <div className="min-w-0 space-y-3">
      {data.near_empty && (
        <div
          role="status"
          className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Almost no text found in this PDF</p>
            <p>
              It is probably scanned or image-based. AI features will ask before sending the original PDF instead of
              this text.
            </p>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{characters.toLocaleString()} characters</p>
      {characters === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No text was extracted.
        </p>
      ) : (
        <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
          {data.markdown}
        </pre>
      )}
    </div>
  )
}
