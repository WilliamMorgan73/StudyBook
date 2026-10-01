import { FileText, TriangleAlert } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTokenEstimate } from '@/lib/aiSource'
import type { SubmoduleSourceState } from '@/lib/useSubmoduleSource'

/**
 * Shows what a Submodule AI action will send, its estimated size (with a warning when large),
 * and the explicit raw-PDF opt-in for near-empty PDFs. State comes from `useSubmoduleSource`.
 */
export function SubmoduleSourcePanel({ source }: { source: SubmoduleSourceState }) {
  const { estimate, error } = source

  if (!estimate) {
    if (error) return <p className="text-sm text-destructive">{error.message || "Couldn't read this submodule's material."}</p>
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Reading your notes and files… converting can take a few seconds.</p>
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (estimate.is_empty && source.rawPdfIds.length === 0 && !estimate.attachments.some((a) => a.near_empty)) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        Nothing to send yet: write some notes or attach PDF/PPTX lecture files.
      </p>
    )
  }

  const files = estimate.attachments.filter((a) => !a.error).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sends your note{files > 0 && ` and ${files} file${files === 1 ? '' : 's'}`}:{' '}
        <span className="font-medium text-foreground tabular-nums">{formatTokenEstimate(estimate.estimated_tokens)}</span>{' '}
        of input.
      </p>

      {estimate.large && (
        <div
          role="status"
          className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            This is a large request ({formatTokenEstimate(estimate.estimated_tokens)}, over{' '}
            {formatTokenEstimate(estimate.large_threshold_tokens)}), so it will cost more than usual.
          </p>
        </div>
      )}

      {estimate.attachments.length > 0 && (
        <ul className="space-y-2 text-sm">
          {estimate.attachments.map((a) => (
            <li key={a.attachment_id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {a.error ? 'left out' : formatTokenEstimate(a.estimated_tokens)}
                </span>
              </div>
              {a.error && <p className="pl-6 text-xs text-destructive">Couldn't read this file: {a.error}</p>}
              {a.near_empty && (
                <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-900 dark:text-amber-200">
                  <p className="text-xs">
                    Almost no text was found in this PDF (it's probably scanned), so only its thin text is sent.
                  </p>
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <Checkbox
                      checked={source.rawPdfIds.includes(a.attachment_id)}
                      onCheckedChange={(checked) => source.setRawPdf(a.attachment_id, checked === true)}
                    />
                    Send the original PDF to Anthropic instead
                    {a.raw_pdf_estimated_tokens !== null && ` (${formatTokenEstimate(a.raw_pdf_estimated_tokens)})`}
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {estimate.is_empty && (
        <p className="text-sm text-muted-foreground">
          There's no text to send yet: write some notes, or send a PDF above as the original file.
        </p>
      )}
    </div>
  )
}
