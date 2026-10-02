import { ExternalLink, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'

import { ExtractedTextDialog } from '@/components/ExtractedTextDialog'
import { Button } from '@/components/ui/button'
import { deleteAttachment, type Attachment } from '@/lib/api'
import { listItem } from '@/lib/motion'

/** The file itself, previewed inline: the browser's PDF viewer, an image, or a media player. */
function EmbedBody({ attachment }: { attachment: Attachment }) {
  switch (attachment.kind) {
    case 'pdf':
      return (
        <iframe
          // navpanes=0 hides the thumbnail sidebar Chrome otherwise opens in a narrow frame.
          src={`${attachment.url}#view=FitH&navpanes=0`}
          title={attachment.filename}
          className="block h-72 w-full border-0 bg-muted"
        />
      )
    case 'image':
      return <img src={attachment.url} alt={attachment.filename} className="block max-h-72 w-full object-contain" />
    case 'video':
      return <video src={attachment.url} controls preload="metadata" className="block max-h-72 w-full bg-black" />
    case 'audio':
      return <audio src={attachment.url} controls preload="metadata" className="block w-full px-3 py-2" />
    default:
      return null
  }
}

/**
 * An Assignment's files, each shown as a preview rather than a link: PDFs, images, video and audio
 * render inline; anything the browser can't show (PPTX, other) stays a one-line row.
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
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const [viewingOpen, setViewingOpen] = useState(false)
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
        <h2 className="font-medium">Files</h2>
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
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {attachments.map((a) => {
              const previewable = a.kind === 'pdf' || a.kind === 'image' || a.kind === 'video' || a.kind === 'audio'
              return (
                <motion.li key={a.id} variants={listItem} initial="hidden" animate="shown" exit="exit">
                  <div className="overflow-hidden rounded-xl border bg-card">
                    <div className={`flex items-center gap-1 py-1 pr-1 pl-3 ${previewable ? 'border-b' : ''}`}>
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate pl-1 text-sm" title={a.filename}>
                        {a.filename}
                      </span>
                      {a.text_extractable && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="View extracted text"
                          title="View extracted text"
                          onClick={() => {
                            setViewing(a)
                            setViewingOpen(true)
                          }}
                        >
                          <FileText />
                        </Button>
                      )}
                      <Button size="icon-sm" variant="ghost" asChild>
                        <a href={a.url} target="_blank" rel="noreferrer" aria-label="Open in new tab" title="Open in new tab">
                          <ExternalLink />
                        </a>
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete file"
                        title="Delete file"
                        onClick={() => handleDelete(a)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <EmbedBody attachment={a} />
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
      <ExtractedTextDialog attachment={viewing} open={viewingOpen} onOpenChange={setViewingOpen} />
    </section>
  )
}
