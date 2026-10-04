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
      <Card size="sm" className="h-full transition-colors hover:ring-foreground/20">
        <CardHeader>
          {/* min-w-0 at every level down to the title (CardHeader is a grid, whose items otherwise
              grow to fit their content), so a long name truncates instead of pushing the code and
              ring out of the card. */}
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <CardTitle className="min-w-0 truncate" title={module.name}>
                  {module.name}
                </CardTitle>
                {module.code && <span className="shrink-0 text-sm font-normal text-muted-foreground">{module.code}</span>}
              </div>
              <CardDescription>{credits ?? module.term ?? ' '}</CardDescription>
            </div>
            <span className="shrink-0">
              <ModuleProgressRing progress={module.completion_progress} color={module.color} size={40} strokeWidth={5} />
            </span>
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
