import { Link } from 'react-router-dom'

import { EventMarker } from '@/components/EventMarker'
import { Badge } from '@/components/ui/badge'
import type { Assignment } from '@/lib/api'

function formatDue(iso: string | null, isExam: boolean) {
  if (!iso) return isExam ? 'No exam date' : 'No due date'
  const date = new Date(iso)
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `Overdue — ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  const verb = isExam ? 'Exam' : 'Due'
  if (days === 0) return `${verb} today`
  if (days === 1) return `${verb} tomorrow`
  return `${verb} ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
}

export function AssignmentItem({ assignment, moduleName }: { assignment: Assignment; moduleName: string }) {
  const overdue = assignment.due_at !== null && new Date(assignment.due_at) < new Date()
  const isExam = assignment.kind === 'exam'

  return (
    <Link
      to={`/modules/${assignment.module_id}/assignments/${assignment.id}`}
      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {isExam && <EventMarker kind="exam" className="shrink-0" />}
          <span className="truncate">{assignment.title}</span>
        </p>
        <p className="truncate text-sm text-muted-foreground">{moduleName}</p>
      </div>
      <Badge variant={overdue ? 'destructive' : 'outline'} className="shrink-0">
        {formatDue(assignment.due_at, isExam)}
      </Badge>
    </Link>
  )
}
