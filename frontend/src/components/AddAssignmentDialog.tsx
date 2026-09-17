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
import { createAssignment, toNaiveDateTime, type Assignment } from '@/lib/api'

export function AddAssignmentDialog({
  moduleId,
  onCreated,
}: {
  moduleId: number
  onCreated: (assignment: Assignment) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [weight, setWeight] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTitle('')
    setDueAt('')
    setWeight('')
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Give the assignment a title.')
      return
    }
    const weightValue = Number(weight)
    if (!weight || weightValue <= 0 || weightValue > 100) {
      setError('Weighting must be a number between 0 and 100.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAssignment({
        module_id: moduleId,
        title: title.trim(),
        due_at: dueAt ? toNaiveDateTime(new Date(dueAt)) : null,
        weight_percent: weightValue,
      })
      onCreated(created)
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the assignment.')
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
          Add assignment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Add an assignment</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="assignment-title">Title</Label>
              <Input
                id="assignment-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Problem Set 3"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assignment-due">Due date</Label>
                <Input
                  id="assignment-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assignment-weight">Weighting (%)</Label>
                <Input
                  id="assignment-weight"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="20"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
