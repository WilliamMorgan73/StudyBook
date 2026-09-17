import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import type { Assignment } from '@/lib/api'

function formatDue(iso: string | null) {
  if (!iso) return 'No due date'
  const date = new Date(iso)
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `Overdue — ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
}

export function AssignmentItem({ assignment, moduleName }: { assignment: Assignment; moduleName: string }) {
  const overdue = assignment.due_at !== null && new Date(assignment.due_at) < new Date()

  return (
    <Link
      to={`/modules/${assignment.module_id}`}
      className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{assignment.title}</p>
        <p className="truncate text-sm text-muted-foreground">{moduleName}</p>
      </div>
      <Badge variant={overdue ? 'destructive' : 'outline'} className="shrink-0">
        {formatDue(assignment.due_at)}
      </Badge>
    </Link>
  )
}
