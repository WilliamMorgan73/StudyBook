import { useState, type FormEvent } from 'react'

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

const SWATCHES = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#22c55e', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#f43f5e', // rose
  '#a855f7', // violet
]

export function AddModuleDialog({ onCreated }: { onCreated: (module: ModuleSummary) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [term, setTerm] = useState('')
  const [credits, setCredits] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setCode('')
    setTerm('')
    setCredits('')
    setColor(SWATCHES[0])
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
      <DialogTrigger asChild>
        <Button>Add module</Button>
      </DialogTrigger>
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
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Use color ${swatch}`}
                    aria-pressed={color === swatch}
                    onClick={() => setColor(swatch)}
                    className={`size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow ${
                      color === swatch ? 'ring-2 ring-foreground' : 'hover:ring-2 hover:ring-foreground/30'
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
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
    </Dialog>
  )
}
