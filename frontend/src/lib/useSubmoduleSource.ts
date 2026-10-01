import { useState } from 'react'

import { getSubmoduleAISource, type SubmoduleSourceEstimate } from '@/lib/api'
import { toggleRawPdf } from '@/lib/aiSource'
import { useAsync } from '@/lib/useAsync'

export interface SubmoduleSourceState {
  estimate: SubmoduleSourceEstimate | null
  error: Error | null
  /** Near-empty PDFs the student opted to send as the original file. Pass to the AI request. */
  rawPdfIds: number[]
  setRawPdf: (attachmentId: number, on: boolean) => void
  /** The estimate is loaded for the current opt-ins and there is something to send. */
  ready: boolean
}

/**
 * The "what gets sent" step shared by every Submodule AI action (flashcard generation,
 * summaries): fetches `GET /submodules/{id}/ai-source`, re-estimating as raw-PDF opt-ins change.
 * Render it with `SubmoduleSourcePanel`, gate the action's run button on `ready`, and send
 * `rawPdfIds` with the request. Mount it only while the dialog is open: the first fetch converts
 * Attachments.
 */
export function useSubmoduleSource(submoduleId: number): SubmoduleSourceState {
  const [rawPdfIds, setRawPdfIds] = useState<number[]>([])
  const { data, error } = useAsync(() => getSubmoduleAISource(submoduleId, rawPdfIds), [submoduleId, rawPdfIds.join()], {
    keepPreviousData: true,
  })
  // keepPreviousData can show an estimate for the previous opt-ins while the next one loads.
  const current =
    data !== null &&
    data.attachments
      .filter((a) => a.send_raw_pdf)
      .map((a) => a.attachment_id)
      .join() === rawPdfIds.join()
  return {
    estimate: data,
    error,
    rawPdfIds,
    setRawPdf: (id, on) => setRawPdfIds((ids) => toggleRawPdf(ids, id, on)),
    ready: current && !data.is_empty,
  }
}
