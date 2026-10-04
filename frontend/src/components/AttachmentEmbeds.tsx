import {
  ExternalLink,
  File,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Presentation,
  ScanText,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'

import { ExtractedTextDialog } from '@/components/ExtractedTextDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { deleteAttachment, type Attachment, type AttachmentKind } from '@/lib/api'
import { listItem } from '@/lib/motion'
import { formatFileSize } from '@/lib/utils'

const KIND: Record<AttachmentKind, { icon: LucideIcon; label: string }> = {
  pdf: { icon: FileText, label: 'PDF' },
  pptx: { icon: Presentation, label: 'Slides' },
  image: { icon: ImageIcon, label: 'Image' },
  video: { icon: Film, label: 'Video' },
  audio: { icon: Music, label: 'Audio' },
  other: { icon: File, label: 'File' },
}

/** Kinds the browser can show in the preview dialog; the rest open in a new tab. */
function isPreviewable(kind: AttachmentKind): boolean {
  return kind === 'pdf' || kind === 'image' || kind === 'video' || kind === 'audio'
}

/** "PDF, 1.2 MB": what the file is and how big, for under its name. */
function fileDetails(attachment: Attachment): string {
  const { label } = KIND[attachment.kind]
  return attachment.size_bytes === null ? label : `${label}, ${formatFileSize(attachment.size_bytes)}`
}

/** The file itself, at preview size: the browser's PDF viewer, an image, or a media player. */
function PreviewBody({ attachment }: { attachment: Attachment }) {
  switch (attachment.kind) {
    case 'pdf':
      return (
        <iframe
          // navpanes=0 hides the thumbnail sidebar Chrome otherwise opens.
          src={`${attachment.url}#view=FitH&navpanes=0`}
          title={attachment.filename}
          className="block h-[70vh] w-full rounded-lg border-0 bg-muted"
        />
      )
    case 'image':
      return (
        <img src={attachment.url} alt={attachment.filename} className="mx-auto block max-h-[70vh] object-contain" />
      )
    case 'video':
      return (
        <video src={attachment.url} controls autoPlay className="block max-h-[70vh] w-full rounded-lg bg-black" />
      )
    case 'audio':
      return <audio src={attachment.url} controls autoPlay className="block w-full" />
    default:
      return null
  }
}

function PreviewDialog({
  attachment,
  open,
  onOpenChange,
}: {
  attachment: Attachment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        {attachment && (
          <>
            <DialogHeader className="flex-row items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="truncate" title={attachment.filename}>
                  {attachment.filename}
                </DialogTitle>
                <DialogDescription>{fileDetails(attachment)}</DialogDescription>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <a href={attachment.url} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open in new tab
                </a>
              </Button>
            </DialogHeader>
            <PreviewBody attachment={attachment} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * An Assignment's files as a compact list for the side rail: one row each (type icon, name, type
 * and size, actions). Clicking a row previews a PDF, image, video or audio file in a dialog; files
 * the browser can't show (PPTX, other) open in a new tab instead.
 */
export function AttachmentEmbeds({
  attachments,
  upload,
  onChanged,
}: {
  attachments: Attachment[]
  upload: (file: File) => Promise<Attachment>
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [textOf, setTextOf] = useState<Attachment | null>(null)
  const [textOpen, setTextOpen] = useState(false)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      await upload(file)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the file.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDelete(a: Attachment) {
    if (!confirm(`Delete "${a.filename}"?`)) return
    await deleteAttachment(a.id)
    onChanged()
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">
          Files
          {attachments.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{attachments.length}</span>
          )}
        </h2>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleUpload(file)
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
          <Upload /> {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {attachments.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="w-full rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Upload the brief, a rubric or slides to keep them beside your notes.
        </button>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          <AnimatePresence initial={false}>
            {attachments.map((a) => {
              const { icon: Icon } = KIND[a.kind]
              const name = (
                <>
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{a.filename}</span>
                    <span className="block text-xs text-muted-foreground">{fileDetails(a)}</span>
                  </span>
                </>
              )
              const nameClass =
                'flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 pl-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              return (
                <motion.li
                  key={a.id}
                  variants={listItem}
                  initial="hidden"
                  animate="shown"
                  exit="exit"
                  className="flex items-center gap-1 py-1.5 pr-1.5 pl-2 transition-colors hover:bg-muted/50"
                >
                  {isPreviewable(a.kind) ? (
                    <button
                      type="button"
                      title={`Preview ${a.filename}`}
                      onClick={() => {
                        setPreviewing(a)
                        setPreviewOpen(true)
                      }}
                      className={nameClass}
                    >
                      {name}
                    </button>
                  ) : (
                    <a href={a.url} target="_blank" rel="noreferrer" title={`Open ${a.filename}`} className={nameClass}>
                      {name}
                    </a>
                  )}
                  {a.text_extractable && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="View extracted text"
                      title="View extracted text"
                      onClick={() => {
                        setTextOf(a)
                        setTextOpen(true)
                      }}
                    >
                      <ScanText />
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete file"
                    title="Delete file"
                    onClick={() => handleDelete(a)}
                  >
                    <Trash2 />
                  </Button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
      <PreviewDialog attachment={previewing} open={previewOpen} onOpenChange={setPreviewOpen} />
      <ExtractedTextDialog attachment={textOf} open={textOpen} onOpenChange={setTextOpen} />
    </section>
  )
}
