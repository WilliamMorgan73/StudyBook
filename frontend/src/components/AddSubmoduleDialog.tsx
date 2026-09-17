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
import { createSubmodule, type Submodule } from '@/lib/api'

export function AddSubmoduleDialog({
  moduleId,
  onCreated,
}: {
  moduleId: number
  onCreated: (submodule: Submodule) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTitle('')
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Give the submodule a title.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createSubmodule({ module_id: moduleId, title: title.trim() })
      onCreated(created)
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the submodule.')
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
        <Button variant="outline" size="sm">
          Add submodule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Add a submodule</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="submodule-title">Title</Label>
              <Input
                id="submodule-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Graph Traversal"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add submodule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
