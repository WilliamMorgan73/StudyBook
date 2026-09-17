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

function creditsLabel(credits: number | null, maxCredits: number | null | undefined) {
  if (credits === null) return null
  const unit = credits === 1 ? 'credit' : 'credits'
  if (maxCredits) {
    return `${credits} ${unit} · ${Math.round((credits / maxCredits) * 100)}%`
  }
  return `${credits} ${unit}`
}

export function ModuleCard({ module, maxCredits }: { module: ModuleSummary; maxCredits?: number | null }) {
  const credits = creditsLabel(module.credits, maxCredits)

  return (
    <Link to={`/modules/${module.id}`}>
      <Card className="h-full transition-colors hover:ring-foreground/20">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <CardTitle className="truncate">{module.name}</CardTitle>
                {module.code && <span className="shrink-0 text-sm font-normal text-muted-foreground">{module.code}</span>}
              </div>
              <CardDescription>{credits ?? module.term ?? ' '}</CardDescription>
            </div>
            <ModuleProgressRing progress={module.completion_progress} color={module.color} size={52} strokeWidth={6} />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatNextLecture(module.next_lecture_at)}</span>
          {module.current_grade !== null && <Badge variant="secondary">{module.current_grade.toFixed(1)}%</Badge>}
        </CardContent>
      </Card>
    </Link>
  )
}
