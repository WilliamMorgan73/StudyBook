import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ExamFormState } from '@/lib/exam'

/** "This is an exam" toggle plus the exam-only duration/location inputs, shared by both Assignment dialogs. */
export function ExamFields({
  value,
  onChange,
}: {
  value: ExamFormState
  onChange: (next: ExamFormState) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="assignment-is-exam"
          checked={value.isExam}
          onCheckedChange={(checked) => onChange({ ...value, isExam: checked === true })}
        />
        <Label htmlFor="assignment-is-exam">This is an exam</Label>
      </div>
      {value.isExam && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="assignment-duration">Duration (minutes)</Label>
            <Input
              id="assignment-duration"
              type="number"
              min={1}
              step={5}
              value={value.duration}
              onChange={(e) => onChange({ ...value, duration: e.target.value })}
              placeholder="120"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assignment-location">Location</Label>
            <Input
              id="assignment-location"
              value={value.location}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              placeholder="Sports Hall"
            />
          </div>
        </div>
      )}
    </div>
  )
}
