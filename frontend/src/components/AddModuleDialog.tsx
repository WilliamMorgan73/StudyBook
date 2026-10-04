import { useState, type FormEvent, type ReactNode } from 'react'

import { ColorSwatchPicker } from '@/components/ColorSwatchPicker'
import { LinkMatchingSeriesDialog } from '@/components/LinkMatchingSeriesDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createModule, type ModuleSummary } from '@/lib/api'
import { MODULE_COLOR_SWATCHES } from '@/lib/colors'

export function AddModuleDialog({
  onCreated,
  trigger,
}: {
  onCreated: (module: ModuleSummary) => void
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [term, setTerm] = useState('')
  const [credits, setCredits] = useState('')
  const [color, setColor] = useState(MODULE_COLOR_SWATCHES[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A module just created with a course code: offer the calendar series it matches.
  const [created, setCreated] = useState<ModuleSummary | null>(null)

  function reset() {
    setName('')
    setCode('')
    setTerm('')
    setCredits('')
    setColor(MODULE_COLOR_SWATCHES[0])
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Give the module a name.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createModule({
        name: name.trim(),
        code: code.trim() || null,
        term: term.trim() || null,
        credits: credits ? Number(credits) : null,
        color,
      })
      onCreated(created)
      setOpen(false)
      reset()
      if (created.code) setCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the module.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>{trigger ?? <Button>Add module</Button>}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Add a module</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="module-name">Name</Label>
              <Input
                id="module-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Algorithms & Data Structures"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="module-code">Code</Label>
                <Input
                  id="module-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="CS201"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="module-credits">Credits</Label>
                <Input
                  id="module-credits"
                  type="number"
                  min={0}
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                  placeholder="4"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="module-term">Term</Label>
              <Input
                id="module-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Fall 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <ColorSwatchPicker value={color} onChange={setColor} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add module'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {/* Its own Dialog root (Radix's Root only provides context), so it opens after this one closes. */}
      <LinkMatchingSeriesDialog
        moduleId={created?.id ?? null}
        code={created?.code ?? null}
        onClose={() => setCreated(null)}
        onLinked={() => {
          if (created) onCreated(created)
        }}
      />
    </Dialog>
  )
}
