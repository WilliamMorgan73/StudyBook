import { Link } from 'react-router-dom'

import { ModuleProgressRing } from '@/components/ModuleProgressRing'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModuleSummary } from '@/lib/api'

function formatNextLecture(iso: string | null) {
  if (!iso) return 'No upcoming lectures'
  const date = new Date(iso)
  return `Next lecture ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
}

export function ModuleCard({ module }: { module: ModuleSummary }) {
  return (
    <Link to={`/modules/${module.id}`}>
      <Card className="h-full transition-colors hover:ring-foreground/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{module.name}</CardTitle>
              <CardDescription>{module.code ?? module.term ?? ' '}</CardDescription>
            </div>
            <ModuleProgressRing progress={module.assignment_progress} color={module.color} size={28} strokeWidth={3} />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatNextLecture(module.next_lecture_at)}</span>
          {module.current_grade !== null && (
            <Badge variant="secondary">{module.current_grade.toFixed(1)}%</Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
