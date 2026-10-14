import { useState } from 'react'
import { Link } from 'react-router-dom'

import { CircleCheck, RotateCcw } from 'lucide-react'

import { ModuleProgressRing } from '@/components/ModuleProgressRing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type ModuleSummary, toNaiveDateTime, updateModule } from '@/lib/api'
import { completedLabel } from '@/lib/moduleCompletion'

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

/** Marks the module completed, or reopens it. Inside the card's link, so it keeps the click to itself. */
function CompletedToggle({ module, onChanged }: { module: ModuleSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const completed = module.completed_at !== null
  const label = completed ? 'Reopen module' : 'Mark as completed'

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    try {
      await updateModule(module.id, { completed_at: completed ? null : toNaiveDateTime(new Date()) })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={busy}
          onClick={toggle}
          // Shown on hover or focus (the Card is `group/card`), so the card stays quiet otherwise.
          className="opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"
        >
          {completed ? <RotateCcw /> : <CircleCheck />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ModuleCard({
  module,
  maxCredits,
  onCompletedChange,
}: {
  module: ModuleSummary
  maxCredits?: number | null
  /** Shows the Mark as completed / Reopen button; called once the module is saved. */
  onCompletedChange?: () => void
}) {
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
          {module.completed_at !== null ? (
            <Badge variant="outline">{completedLabel(module.completed_at)}</Badge>
          ) : (
            <span>{formatNextLecture(module.next_lecture_at)}</span>
          )}
          <span className="flex items-center gap-1">
            {onCompletedChange && <CompletedToggle module={module} onChanged={onCompletedChange} />}
            {module.current_grade !== null && <Badge variant="secondary">{module.current_grade.toFixed(1)}%</Badge>}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}
