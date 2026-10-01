import { ChevronRight, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'

import { AIActionButton } from '@/components/AIActionButton'
import { MarkdownView } from '@/components/MarkdownView'
import { SubmoduleSourcePanel } from '@/components/SubmoduleSourcePanel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { aiErrorMessage } from '@/lib/ai'
import { summarizeSubmodule, type SubmoduleDetail } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSubmoduleSource } from '@/lib/useSubmoduleSource'

const COLLAPSED_KEY = 'studybook.submodule.summaryCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * The stored AI summary, shown above the editor and kept apart from the student's own note.
 * Collapsible (remembered across Submodules), with Regenerate and a "notes changed" nudge when
 * `summary_stale`. Renders nothing until a summary exists. It never regenerates by itself.
 */
export function SubmoduleSummary({
  submodule,
  aiEnabled,
  onRegenerate,
}: {
  submodule: SubmoduleDetail
  aiEnabled?: boolean
  onRegenerate: () => void
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  if (submodule.summary_markdown === null) return null

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next))
    } catch {
      // Storage unavailable: the toggle still works for this visit.
    }
  }

  return (
    <section aria-label="AI summary" className="mb-8 rounded-xl border bg-muted/30">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground"
        >
          <ChevronRight className={cn('size-4 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
          <Sparkles className="size-4 text-muted-foreground" />
          Summary
        </button>
        {submodule.summary_stale && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-200">
            <TriangleAlert className="size-3" /> Notes changed since this summary
          </span>
        )}
        <AIActionButton size="sm" variant="ghost" className="ml-auto" aiEnabled={aiEnabled} onClick={onRegenerate}>
          <RefreshCw /> Regenerate
        </AIActionButton>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <MarkdownView className="prose-sm border-t px-4 py-3">{submodule.summary_markdown}</MarkdownView>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * The summarise/regenerate confirm step: what will be sent (`SubmoduleSourcePanel`, with the
 * raw-PDF opt-in), then `POST /submodules/{id}/summary`. `onSummarized` gets the updated
 * Submodule; a failure keeps the dialog open with the error and leaves any old summary as is.
 */
export function SummarizeDialog({
  submodule,
  open,
  onOpenChange,
  onSummarized,
}: {
  submodule: SubmoduleDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onSummarized: (updated: SubmoduleDetail) => void
}) {
  const regenerating = submodule.summary_markdown !== null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {regenerating ? 'Regenerate summary' : 'Summarize'} · {submodule.title}
          </DialogTitle>
          <DialogDescription>
            The AI summarises your note and lecture files.
            {regenerating && ' The new summary replaces the current one.'}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: the first estimate converts Attachments. */}
        {open && (
          <SummarizeBody
            submoduleId={submodule.id}
            regenerating={regenerating}
            onCancel={() => onOpenChange(false)}
            onSummarized={(updated) => {
              onSummarized(updated)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SummarizeBody({
  submoduleId,
  regenerating,
  onCancel,
  onSummarized,
}: {
  submoduleId: number
  regenerating: boolean
  onCancel: () => void
  onSummarized: (updated: SubmoduleDetail) => void
}) {
  const source = useSubmoduleSource(submoduleId)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    try {
      onSummarized(await summarizeSubmodule(submoduleId, { raw_pdf_ids: source.rawPdfIds }))
    } catch (err) {
      setError(aiErrorMessage(err))
      setRunning(false)
    }
  }

  return (
    <>
      <div className="min-w-0 space-y-4">
        <SubmoduleSourcePanel source={source} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={run} disabled={!source.ready || running}>
          {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {running ? 'Summarizing…' : regenerating ? 'Regenerate' : 'Summarize'}
        </Button>
      </DialogFooter>
    </>
  )
}
