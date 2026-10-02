import { EditorView } from '@codemirror/view'

import type { Attachment } from '@/lib/api'
import { attachmentMarkdown, pastedImageName } from '@/lib/markdownBlocks'

/** MarkdownEditor saves edits with this user event straight away (see its onCommit). */
export const UPLOAD_EVENT = 'input.upload'

export interface UploadHandlers {
  upload: (file: File) => Promise<Attachment>
  onError: (message: string) => void
}

let uploadCounter = 0

/**
 * Pasted or dropped files upload as Attachments. Each gets a placeholder line at the paste/drop
 * point, replaced by its markdown when the upload finishes (found again by its unique text, so
 * edits made meanwhile don't matter), or removed if it fails or was deleted. Returns false (so
 * CodeMirror handles the event) when there are no files or no upload handler.
 */
export function fileDropHandlers(getHandlers: () => UploadHandlers | null) {
  function handle(view: EditorView, files: File[], pos: number): boolean {
    const handlers = getHandlers()
    if (files.length === 0 || !handlers) return false

    const line = view.state.doc.lineAt(pos)
    const before = line.text.slice(0, pos - line.from).trim() ? '\n' : ''
    const after = line.text.slice(pos - line.from).trim() ? '\n' : ''
    const placeholders = files.map((file) => `[Uploading ${file.name}… #${++uploadCounter}]`)
    view.dispatch({
      changes: { from: pos, insert: before + placeholders.join('\n') + after },
      userEvent: 'input.upload.placeholder',
    })

    files.forEach((file, i) => {
      handlers.upload(file).then(
        (attachment) => replacePlaceholder(view, placeholders[i], attachmentMarkdown(attachment)),
        (error: unknown) => {
          replacePlaceholder(view, placeholders[i], '')
          handlers.onError(`Couldn't upload ${file.name}: ${error instanceof Error ? error.message : 'unknown error'}`)
        },
      )
    })
    return true
  }

  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = [...(event.clipboardData?.files ?? [])].map(renamePastedImage)
      if (!handle(view, files, view.state.selection.main.head)) return false
      event.preventDefault()
      return true
    },
    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])]
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
      if (!handle(view, files, pos)) return false
      event.preventDefault()
      return true
    },
  })
}

function renamePastedImage(file: File): File {
  const name = pastedImageName(file.name, new Date())
  return name ? new File([file], name, { type: file.type }) : file
}

function replacePlaceholder(view: EditorView, placeholder: string, markdown: string) {
  // Navigated away mid-upload: the file is still attached (listed under Files), just not placed.
  if (!view.dom.isConnected) return
  const from = view.state.doc.toString().indexOf(placeholder)
  if (from === -1) return // deleted while uploading
  view.dispatch({ changes: { from, to: from + placeholder.length, insert: markdown }, userEvent: UPLOAD_EVENT })
}
