import { useRef, useState } from 'react'

import { ColumnsBlockView } from '@/components/ColumnsBlockView'
import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Attachment } from '@/lib/api'
import {
  buildCalloutMarkdown,
  buildColumnsMarkdown,
  CALLOUT_LABELS,
  CALLOUT_TYPES,
  type CalloutType,
} from '@/lib/markdownBlocks'

type BlockKind = 'callout' | 'sidebox'

// Radix Select can't use '' as an item value.
const NO_IMAGE = 'none'

/**
 * Builds a callout or side box as markdown, with a live preview. `onInsert` gets the markdown;
 * `onClosed` runs as the dialog closes (inserted or not), in place of Radix's focus restore.
 */
export function InsertBlockDialog({
  open,
  onOpenChange,
  onInsert,
  onClosed,
  attachments,
  upload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (markdown: string) => void
  onClosed: () => void
  /** Image Attachments are offered for the side box. */
  attachments: readonly Attachment[]
  /** Uploads a new side-box image; without it only existing images can be chosen. */
  upload?: (file: File) => Promise<Attachment>
}) {
  const [kind, setKind] = useState<BlockKind>('callout')
  const [calloutType, setCalloutType] = useState<CalloutType>('note')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [main, setMain] = useState('')
  const [side, setSide] = useState('')
  const [sideImage, setSideImage] = useState(NO_IMAGE)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const images = attachments.filter((a) => a.kind === 'image')
  // The image leads the box, under its title.
  const sideMarkdown = sideImage === NO_IMAGE ? side : `![](${sideImage})\n\n${side}`

  async function handleImageUpload(file: File) {
    if (!upload) return
    setUploading(true)
    setUploadError(null)
    try {
      setSideImage((await upload(file)).url)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload the image.')
    } finally {
      setUploading(false)
      if (imageInput.current) imageInput.current.value = ''
    }
  }

  function reset() {
    setTitle('')
    setBody('')
    setMain('')
    setSide('')
    setSideImage(NO_IMAGE)
    setUploadError(null)
  }

  function handleInsert() {
    onInsert(kind === 'callout' ? buildCalloutMarkdown(calloutType, title, body) : buildColumnsMarkdown(main, title, sideMarkdown))
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClosed()
        }}
      >
        <DialogHeader>
          <DialogTitle>Insert block</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="block-kind">Block</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as BlockKind)}>
                  <SelectTrigger id="block-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="callout">Callout</SelectItem>
                    <SelectItem value="sidebox">Side box</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {kind === 'callout' && (
                <div className="space-y-1.5">
                  <Label htmlFor="callout-type">Type</Label>
                  <Select value={calloutType} onValueChange={(value) => setCalloutType(value as CalloutType)}>
                    <SelectTrigger id="callout-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALLOUT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {CALLOUT_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {kind === 'sidebox' && (
              <div className="space-y-1.5">
                <Label htmlFor="block-main">Main text</Label>
                <Textarea
                  id="block-main"
                  rows={4}
                  value={main}
                  onChange={(e) => setMain(e.target.value)}
                  placeholder="The paragraph the box sits beside…"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="block-title">{kind === 'callout' ? 'Title' : 'Box title'}</Label>
              <Input
                id="block-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === 'callout' ? CALLOUT_LABELS[calloutType] : 'Key points'}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="block-body">{kind === 'callout' ? 'Content' : 'Box content'}</Label>
              <Textarea
                id="block-body"
                rows={kind === 'callout' ? 6 : 4}
                value={kind === 'callout' ? body : side}
                onChange={(e) => (kind === 'callout' ? setBody(e.target.value) : setSide(e.target.value))}
                placeholder="Markdown works here: **bold**, - lists, ![image](url), $math$"
              />
            </div>

            {kind === 'sidebox' && (
              <div className="space-y-1.5">
                <Label htmlFor="block-image">Box image</Label>
                <div className="flex gap-2">
                  <Select value={sideImage} onValueChange={setSideImage}>
                    <SelectTrigger id="block-image" className="min-w-0 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_IMAGE}>None</SelectItem>
                      {images.map((image) => (
                        <SelectItem key={image.id} value={image.url}>
                          {image.filename}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {upload && (
                    <>
                      <input
                        ref={imageInput}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleImageUpload(file)
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => imageInput.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? 'Uploading…' : 'Upload…'}
                      </Button>
                    </>
                  )}
                </div>
                {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label>Preview</Label>
            <div className="max-h-96 overflow-y-auto rounded-lg border p-3 text-sm">
              {kind === 'callout' ? (
                <MarkdownView>{buildCalloutMarkdown(calloutType, title, body)}</MarkdownView>
              ) : (
                <ColumnsBlockView main={main} sideTitle={title.trim()} side={sideMarkdown} />
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleInsert}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
