import { useState } from 'react'

import { ColumnsBlockView } from '@/components/ColumnsBlockView'
import { MarkdownView } from '@/components/MarkdownView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  buildCalloutMarkdown,
  buildColumnsMarkdown,
  CALLOUT_LABELS,
  CALLOUT_TYPES,
  type CalloutType,
} from '@/lib/markdownBlocks'

type BlockKind = 'callout' | 'sidebox'

/**
 * Builds a callout or side box as markdown, with a live preview. `onInsert` gets the markdown;
 * `onClosed` runs as the dialog closes (inserted or not), in place of Radix's focus restore.
 */
export function InsertBlockDialog({
  open,
  onOpenChange,
  onInsert,
  onClosed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (markdown: string) => void
  onClosed: () => void
}) {
  const [kind, setKind] = useState<BlockKind>('callout')
  const [calloutType, setCalloutType] = useState<CalloutType>('note')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [main, setMain] = useState('')
  const [side, setSide] = useState('')

  function reset() {
    setTitle('')
    setBody('')
    setMain('')
    setSide('')
  }

  function handleInsert() {
    onInsert(kind === 'callout' ? buildCalloutMarkdown(calloutType, title, body) : buildColumnsMarkdown(main, title, side))
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
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label>Preview</Label>
            <div className="max-h-96 overflow-y-auto rounded-lg border p-3 text-sm">
              {kind === 'callout' ? (
                <MarkdownView>{buildCalloutMarkdown(calloutType, title, body)}</MarkdownView>
              ) : (
                <ColumnsBlockView main={main} sideTitle={title.trim()} side={side} />
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
