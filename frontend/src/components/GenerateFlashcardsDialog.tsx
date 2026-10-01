import { Check, Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'

import { AIActionButton } from '@/components/AIActionButton'
import { FlashcardFace } from '@/components/FlashcardFace'
import { SubmoduleSourcePanel } from '@/components/SubmoduleSourcePanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { aiErrorMessage } from '@/lib/ai'
import { createFlashcard, generateFlashcards } from '@/lib/api'
import {
  clampCardCount,
  countByStatus,
  DEFAULT_CARD_COUNT,
  MAX_CARD_COUNT,
  pendingItems,
  reviewItems,
  updateItem,
  validateEdit,
  type ReviewItem,
} from '@/lib/flashcardReview'
import { useSubmoduleSource } from '@/lib/useSubmoduleSource'

interface Target {
  id: number
  module_id: number
  title: string
}

/**
 * The "Generate cards" action and its dialog: pick a count, check what will be sent
 * (`SubmoduleSourcePanel`), then review Claude's proposals one by one. Nothing is saved until a
 * card is accepted, and each accepted card is created right away with `source: 'ai'`.
 * `beforeOpen` lets the page flush unsaved note edits first; `onSaved` runs on close if any
 * card was saved.
 */
export function GenerateFlashcardsDialog({
  submodule,
  aiEnabled,
  beforeOpen,
  onSaved,
}: {
  submodule: Target
  aiEnabled?: boolean
  beforeOpen?: () => Promise<unknown> | void
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const savedRef = useRef(0)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      savedRef.current = 0
    } else if (savedRef.current > 0) {
      onSaved?.()
    }
  }

  return (
    <>
      <AIActionButton
        size="sm"
        variant="outline"
        aiEnabled={aiEnabled}
        onClick={async () => {
          await beforeOpen?.()
          handleOpenChange(true)
        }}
      >
        <Sparkles /> Generate cards
      </AIActionButton>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate flashcards · {submodule.title}</DialogTitle>
            <DialogDescription>
              Claude proposes cards from your note and lecture files. Nothing is saved until you accept a card.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so each run starts fresh and re-reads the material. */}
          {open && (
            <GenerateBody
              submodule={submodule}
              onSaved={() => (savedRef.current += 1)}
              onClose={() => handleOpenChange(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function GenerateBody({ submodule, onSaved, onClose }: { submodule: Target; onSaved: () => void; onClose: () => void }) {
  const source = useSubmoduleSource(submodule.id)
  const [countInput, setCountInput] = useState(String(DEFAULT_CARD_COUNT))
  const [generating, setGenerating] = useState(false)
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    const count = clampCardCount(countInput)
    setCountInput(String(count))
    setGenerating(true)
    setError(null)
    try {
      const { proposals } = await generateFlashcards(submodule.id, { count, raw_pdf_ids: source.rawPdfIds })
      setItems(reviewItems(proposals))
    } catch (err) {
      setError(aiErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  async function accept(item: ReviewItem) {
    setItems((current) => current && updateItem(current, item.key, { status: 'saving' }))
    setError(null)
    try {
      await createFlashcard({
        module_id: submodule.module_id,
        submodule_id: submodule.id,
        front: item.front,
        back: item.back,
        source: 'ai',
      })
      onSaved()
      setItems((current) => current && updateItem(current, item.key, { status: 'accepted' }))
      return true
    } catch (err) {
      setItems((current) => current && updateItem(current, item.key, { status: 'pending' }))
      setError(err instanceof Error ? `Couldn't save a card: ${err.message}` : "Couldn't save a card.")
      return false
    }
  }

  async function acceptAll() {
    if (!items) return
    // One at a time, in order; stop at the first failure so its error stays visible.
    for (const item of pendingItems(items)) {
      if (!(await accept(item))) return
    }
  }

  if (items === null) {
    return (
      <>
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="generate-count" className="shrink-0">
              Number of cards
            </Label>
            <Input
              id="generate-count"
              type="number"
              min={1}
              max={MAX_CARD_COUNT}
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={() => setCountInput(String(clampCardCount(countInput)))}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">up to {MAX_CARD_COUNT}</span>
          </div>
          <SubmoduleSourcePanel source={source} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={!source.ready || generating}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </>
    )
  }

  const counts = countByStatus(items)
  return (
    <>
      <div className="min-w-0 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Claude didn't propose any new cards. Your existing cards may already cover this material.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">
            {items.length} proposed · {counts.accepted} accepted · {counts.rejected} rejected
          </p>
        )}
        <ul className="-mx-1 max-h-[60vh] space-y-3 overflow-y-auto px-1">
          <AnimatePresence initial={false}>
            {items
              .filter((item) => item.status !== 'rejected')
              .map((item) => (
                <ProposalCard
                  key={item.key}
                  item={item}
                  onAccept={() => accept(item)}
                  onReject={() => setItems((current) => current && updateItem(current, item.key, { status: 'rejected' }))}
                  onEdit={(front, back) => setItems((current) => current && updateItem(current, item.key, { front, back }))}
                />
              ))}
          </AnimatePresence>
        </ul>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        {counts.pending > 0 && (
          <Button variant="outline" onClick={acceptAll} disabled={counts.saving > 0}>
            <Check /> Accept all remaining ({counts.pending})
          </Button>
        )}
        <Button onClick={onClose} disabled={counts.saving > 0}>
          Done
        </Button>
      </DialogFooter>
    </>
  )
}

function ProposalCard({
  item,
  onAccept,
  onReject,
  onEdit,
}: {
  item: ReviewItem
  onAccept: () => void
  onReject: () => void
  onEdit: (front: string, back: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [front, setFront] = useState(item.front)
  const [back, setBack] = useState(item.back)
  const [editError, setEditError] = useState<string | null>(null)

  function startEditing() {
    setFront(item.front)
    setBack(item.back)
    setEditError(null)
    setEditing(true)
  }

  function saveEdit() {
    const result = validateEdit(front, back)
    if ('error' in result) {
      setEditError(result.error)
      return
    }
    onEdit(result.front, result.back)
    setEditing(false)
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
      className="space-y-2"
    >
      {editing ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`proposal-front-${item.key}`}>Front</Label>
            <Textarea id={`proposal-front-${item.key}`} value={front} onChange={(e) => setFront(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`proposal-back-${item.key}`}>Back</Label>
            <Textarea id={`proposal-back-${item.key}`} value={back} onChange={(e) => setBack(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Markdown and $math$ work on both sides.</p>
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit}>
              Save edit
            </Button>
          </div>
        </div>
      ) : (
        <FlashcardFace front={item.front} back={item.back} className="min-h-0" />
      )}
      {!editing && (
        <div className="flex items-center justify-end gap-2">
          {item.status === 'accepted' && (
            <Badge variant="secondary">
              <Check /> Saved
            </Badge>
          )}
          {item.status === 'saving' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {item.status === 'pending' && (
            <>
              <Button size="sm" variant="ghost" onClick={onReject}>
                <X /> Reject
              </Button>
              <Button size="sm" variant="ghost" onClick={startEditing}>
                <Pencil /> Edit
              </Button>
              <Button size="sm" onClick={onAccept}>
                <Check /> Accept
              </Button>
            </>
          )}
        </div>
      )}
    </motion.li>
  )
}
