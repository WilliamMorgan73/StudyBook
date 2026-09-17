import { Paperclip, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { deleteAttachment, type Attachment } from '@/lib/api'

export function AttachmentList({
  attachments,
  upload,
  onChanged,
  title,
}: {
  attachments: Attachment[]
  upload: (file: File) => Promise<Attachment>
  onChanged: () => void
  title?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  async function handleDelete(id: number) {
    await deleteAttachment(id)
    onChanged()
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        {title && <h2 className="text-lg font-medium">{title}</h2>}
        <div className={title ? undefined : 'ml-auto'}>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.ppt,.pptx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload PDF/PPTX'}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files attached yet.</p>
      ) : (
        <ul className="divide-y">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {a.filename}
              </a>
              <Button size="icon-sm" variant="ghost" aria-label="Delete file" onClick={() => handleDelete(a.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
