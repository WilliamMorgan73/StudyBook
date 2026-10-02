import { FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Attachment } from '@/lib/api'

export type PickerMode = 'image' | 'file'

const ICONS = { image: ImageIcon, pdf: FileText } as const

/**
 * Picks one of the note's Attachments, or uploads a new one, for the `/image` and `/embed`
 * commands. `onPick` gets the chosen Attachment; `onClosed` runs as the dialog closes, in place of
 * Radix's focus restore.
 */
export function AttachmentPickerDialog({
  mode,
  open,
  onOpenChange,
  attachments,
  upload,
  onPick,
  onClosed,
}: {
  mode: PickerMode
  open: boolean
  onOpenChange: (open: boolean) => void
  attachments: readonly Attachment[]
  upload: (file: File) => Promise<Attachment>
  onPick: (attachment: Attachment) => void
  onClosed: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const shown = mode === 'image' ? attachments.filter((a) => a.kind === 'image') : attachments

  function pick(attachment: Attachment) {
    onPick(attachment)
    onOpenChange(false)
  }

  async function handleUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      pick(await upload(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the file.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClosed()
        }}
      >
        <DialogHeader>
          <DialogTitle>{mode === 'image' ? 'Insert image' : 'Embed file'}</DialogTitle>
          <DialogDescription>
            {mode === 'image'
              ? 'Choose an image attached to this note, or upload one. You can also paste or drop images into the note.'
              : 'PDFs, video and audio show inline; other files show as a link.'}
          </DialogDescription>
        </DialogHeader>

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {mode === 'image' ? 'No images attached yet.' : 'No files attached yet.'}
          </p>
        ) : (
          <ul className="-mx-1 max-h-72 overflow-y-auto">
            {shown.map((attachment) => {
              const Icon = ICONS[attachment.kind as keyof typeof ICONS] ?? Paperclip
              return (
                <li key={attachment.id}>
                  <button
                    type="button"
                    onClick={() => pick(attachment)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    {attachment.kind === 'image' ? (
                      <img src={attachment.url} alt="" className="size-8 shrink-0 rounded object-cover" />
                    ) : (
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <input
            ref={fileInput}
            type="file"
            accept={mode === 'image' ? 'image/png,image/jpeg,image/gif,image/webp' : undefined}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload…'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
