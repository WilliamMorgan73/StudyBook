import { CalendarClock } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createRevisionPlan, replanRevision, type Assignment } from '@/lib/api'
import { toggleWeekday, WEEKDAY_LABELS } from '@/lib/busyTime'
import {
  defaultRevisionPlanForm,
  formatSessionLength,
  revisionPlanPayload,
  SESSION_LENGTH_OPTIONS,
  type RevisionPlanFormState,
} from '@/lib/revision'

const pad = (n: number) => String(n).padStart(2, '0')

function todayValue() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * "Plan revision" for an exam: start date, study weekdays and session length. The backend schedules the
 * sessions around lectures, busy time and other exams' sessions, or explains why they don't fit.
 * `mode="replan"` reschedules an existing plan's upcoming, not-done sessions instead, starting from
 * `initialForm(today)` (the plan's own settings).
 */
export function PlanRevisionDialog({
  exam,
  open,
  onOpenChange,
  onPlanned,
  mode = 'plan',
  initialForm,
}: {
  exam: Assignment & { due_at: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onPlanned: () => void
  mode?: 'plan' | 'replan'
  initialForm?: (today: string) => RevisionPlanFormState
}) {
  const startingForm = () => (initialForm ?? defaultRevisionPlanForm)(todayValue())
  const [form, setForm] = useState<RevisionPlanFormState>(startingForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const replan = mode === 'replan'

  // Start each open afresh from today (and, when replanning, the plan as it is now).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(startingForm())
      setError(null)
    }
  }

  const set = (patch: Partial<RevisionPlanFormState>) => setForm((f) => ({ ...f, ...patch }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const payload = revisionPlanPayload(form, exam.due_at)
    if ('error' in payload) {
      setError(payload.error)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await (replan ? replanRevision : createRevisionPlan)(exam.id, payload)
      onPlanned()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${replan ? 'replan' : 'plan'} revision.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{replan ? 'Replan revision' : 'Plan revision'}</DialogTitle>
            <DialogDescription>
              {replan
                ? "Sessions you've done or that have already started stay. Every upcoming session you haven't done is rescheduled from now, weighted by your current weakest topics."
                : "One session on each chosen day until the exam, fitted around lectures, busy time and other exams' revision. Weaker topics get more sessions."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="revision-start">Start date</Label>
                <Input
                  id="revision-start"
                  type="date"
                  value={form.startDate}
                  max={exam.due_at.slice(0, 10)}
                  onChange={(e) => set({ startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="revision-length">Session length</Label>
                <Select
                  value={String(form.sessionMinutes)}
                  onValueChange={(value) => set({ sessionMinutes: Number(value) })}
                >
                  <SelectTrigger id="revision-length" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_LENGTH_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {formatSessionLength(minutes)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Study on</Label>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => {
                  const on = form.weekdays.includes(day)
                  return (
                    <Button
                      key={label}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      aria-pressed={on}
                      onClick={() => set({ weekdays: toggleWeekday(form.weekdays, day) })}
                      className="w-11"
                    >
                      {label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Covers {exam.covered_submodules.length} topic{exam.covered_submodules.length === 1 ? '' : 's'}. Sessions
              are placed between 9am and 9pm.
            </p>

            {error && (
              <p role="alert" className="flex gap-2 text-sm text-destructive">
                <CalendarClock className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {replan ? (submitting ? 'Replanning…' : 'Replan sessions') : submitting ? 'Planning…' : 'Plan sessions'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
