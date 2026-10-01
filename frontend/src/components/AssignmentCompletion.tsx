import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent, type ReactNode } from 'react'

import { CompletionTick } from '@/components/CompletionTick'
import { AnimatedNumber } from '@/components/RadialProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAssignment, type Assignment } from '@/lib/api'

function GradeNumber({ value }: { value: number }) {
  return <AnimatedNumber value={value} decimals={Number.isInteger(value) ? 0 : 1} />
}

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
  // Bumped to pop the centre-screen tick.
  const [celebrations, setCelebrations] = useState(0)

  // After saving a grade the form stays up until the refetched assignment arrives, so the view
  // swaps once (form → score) rather than flashing the stale "submitted" buttons in between.
  const [savedFrom, setSavedFrom] = useState<Assignment | null>(null)
  if (savedFrom && savedFrom !== assignment) {
    setSavedFrom(null)
    setEntering(false)
  }

  async function markComplete() {
    setSubmitting(true)
    try {
      await updateAssignment(assignment.id, { status: 'submitted' })
      setCelebrations((c) => c + 1)
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
      // Only the first grading celebrates; editing an existing grade doesn't.
      if (assignment.status !== 'graded') setCelebrations((c) => c + 1)
      setSavedFrom(assignment)
      onChanged()
    } finally {
      setSubmitting(false)
    }
  }

  let view: string
  let content: ReactNode

  if (entering) {
    view = 'grading'
    content = (
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setSavedFrom(null)
            setEntering(false)
          }}
        >
          Cancel
        </Button>
      </form>
    )
  } else if (assignment.status === 'graded') {
    view = 'graded'
    content = (
      <div className="text-right">
        <p className="text-3xl font-semibold tabular-nums">
          {assignment.grade_earned !== null && assignment.grade_max !== null ? (
            <>
              <GradeNumber value={assignment.grade_earned} />/{assignment.grade_max}
            </>
          ) : (
            'Graded'
          )}
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
  } else if (assignment.status === 'submitted') {
    view = 'submitted'
    content = (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={markUncomplete} disabled={submitting}>
          Uncomplete
        </Button>
        <Button size="sm" onClick={startGrading}>
          Enter grade
        </Button>
      </div>
    )
  } else {
    view = 'todo'
    content = (
      <Button size="sm" onClick={markComplete} disabled={submitting}>
        Mark complete
      </Button>
    )
  }

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
      <CompletionTick trigger={celebrations} />
    </>
  )
}
