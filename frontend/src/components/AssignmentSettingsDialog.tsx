import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CoveredSubmodulesPicker } from '@/components/CoveredSubmodulesPicker'
import { ExamFields } from '@/components/ExamFields'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { deleteAssignment, toNaiveDateTime, updateAssignment, type Assignment } from '@/lib/api'
import { coveredAfterExamToggle, examFieldsPayload, type ExamFormState } from '@/lib/exam'

function examFormState(
  kind: Assignment['kind'],
  durationMinutes: number | null,
  location: string | null,
): ExamFormState {
  return { isExam: kind === 'exam', duration: durationMinutes ? String(durationMinutes) : '', location: location ?? '' }
}

function toLocalInput(iso: string) {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function AssignmentSettingsDialog({
  moduleId,
  assignment,
  submodules,
  open,
  onOpenChange,
  onChanged,
}: {
  moduleId: number
  assignment: Assignment
  submodules: { id: number; title: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(assignment.title)
  const [dueAt, setDueAt] = useState(assignment.due_at ? toLocalInput(assignment.due_at) : '')
  const [weight, setWeight] = useState(String(assignment.weight_percent))
  const [description, setDescription] = useState(assignment.description ?? '')
  const [exam, setExam] = useState(() =>
    examFormState(assignment.kind, assignment.duration_minutes, assignment.location),
  )
  const coveredIds = assignment.covered_submodules.map((s) => s.id).join(',')
  const [covered, setCovered] = useState(() => assignment.covered_submodules.map((s) => s.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(assignment.title)
      setDueAt(assignment.due_at ? toLocalInput(assignment.due_at) : '')
      setWeight(String(assignment.weight_percent))
      setDescription(assignment.description ?? '')
      setExam(examFormState(assignment.kind, assignment.duration_minutes, assignment.location))
      setCovered(coveredIds ? coveredIds.split(',').map(Number) : [])
      setError(null)
    }
  }, [
    open,
    assignment.title,
    assignment.due_at,
    assignment.weight_percent,
    assignment.description,
    assignment.kind,
    assignment.duration_minutes,
    assignment.location,
    coveredIds,
  ])

  function handleExamChange(next: ExamFormState) {
    setCovered((c) =>
      coveredAfterExamToggle(
        exam.isExam,
        next.isExam,
        c,
        submodules.map((s) => s.id),
      ),
    )
    setExam(next)
  }

  async function handleSave() {
    const weightValue = Number(weight)
    if (!title.trim() || !weight || weightValue <= 0 || weightValue > 100) {
      setError('Title and a weighting between 0 and 100 are required.')
      return
    }
    const examFields = examFieldsPayload(exam)
    if ('error' in examFields) {
      setError(examFields.error)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateAssignment(assignment.id, {
        title: title.trim(),
        due_at: dueAt ? toNaiveDateTime(new Date(dueAt)) : null,
        weight_percent: weightValue,
        description: description.trim() || null,
        ...examFields,
        covered_submodule_ids: covered,
      })
      onOpenChange(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${assignment.title}"? This removes its notes, files, and checklist.`)) return
    await deleteAssignment(assignment.id)
    navigate(`/modules/${moduleId}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assignment settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="assignment-title">Title</Label>
            <Input id="assignment-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assignment-due">{exam.isExam ? 'Exam start' : 'Due date'}</Label>
              <Input id="assignment-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
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
              />
            </div>
          </div>

          <ExamFields value={exam} onChange={handleExamChange} />

          <CoveredSubmodulesPicker submodules={submodules} value={covered} onChange={setCovered} />

          <div className="space-y-1.5">
            <Label htmlFor="assignment-description">Description</Label>
            <Textarea
              id="assignment-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDelete}>
              Delete assignment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
