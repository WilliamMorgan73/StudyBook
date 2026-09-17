import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAssignment, type Assignment } from '@/lib/api'

export function AssignmentCompletion({
  assignment,
  onChanged,
}: {
  assignment: Assignment
  onChanged: () => void
}) {
  const [entering, setEntering] = useState(false)
  const [gradeEarned, setGradeEarned] = useState('')
  const [gradeMax, setGradeMax] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function markComplete() {
    setSubmitting(true)
    try {
      await updateAssignment(assignment.id, { status: 'submitted' })
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  async function markUncomplete() {
    setSubmitting(true)
    try {
      await updateAssignment(assignment.id, { status: 'not_started', grade_earned: null, grade_max: null })
      setEntering(false)
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  function startGrading() {
    setGradeEarned(assignment.grade_earned !== null ? String(assignment.grade_earned) : '')
    setGradeMax(assignment.grade_max !== null ? String(assignment.grade_max) : '')
    setEntering(true)
  }

  async function saveGrade(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await updateAssignment(assignment.id, {
        status: 'graded',
        grade_earned: gradeEarned ? Number(gradeEarned) : null,
        grade_max: gradeMax ? Number(gradeMax) : null,
      })
      setEntering(false)
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  if (entering) {
    return (
      <form onSubmit={saveGrade} className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="grade-earned" className="text-xs">
            Score
          </Label>
          <Input
            id="grade-earned"
            type="number"
            value={gradeEarned}
            onChange={(e) => setGradeEarned(e.target.value)}
            className="w-20"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="grade-max" className="text-xs">
            Out of
          </Label>
          <Input id="grade-max" type="number" value={gradeMax} onChange={(e) => setGradeMax(e.target.value)} className="w-20" />
        </div>
        <Button type="submit" size="sm" disabled={submitting}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEntering(false)}>
          Cancel
        </Button>
      </form>
    )
  }

  if (assignment.status === 'graded') {
    return (
      <div className="text-right">
        <p className="text-3xl font-semibold tabular-nums">
          {assignment.grade_earned !== null && assignment.grade_max !== null
            ? `${assignment.grade_earned}/${assignment.grade_max}`
            : 'Graded'}
        </p>
        <div className="mt-1 flex justify-end gap-3">
          <button type="button" onClick={startGrading} className="text-sm text-muted-foreground hover:text-foreground">
            Edit grade
          </button>
          <button type="button" onClick={markUncomplete} className="text-sm text-muted-foreground hover:text-foreground">
            Uncomplete
          </button>
        </div>
      </div>
    )
  }

  if (assignment.status === 'submitted') {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={markUncomplete} disabled={submitting}>
          Uncomplete
        </Button>
        <Button size="sm" onClick={startGrading}>
          Enter grade
        </Button>
      </div>
    )
  }

  return (
    <Button size="sm" onClick={markComplete} disabled={submitting}>
      Mark complete
    </Button>
  )
}
