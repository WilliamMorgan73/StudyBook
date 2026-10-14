import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { useOverview } from '@/components/dashboard/overviewContext'
import { useWidgetConfig } from '@/components/dashboard/widgetInstance'
import { LoadSwap } from '@/components/LoadSwap'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WidgetError } from '@/components/WidgetError'
import { listAssignments, type Assignment } from '@/lib/api'
import {
  classOf,
  DEGREE_CLASSES,
  GRADE_TARGET_CONFIG,
  targetLabel,
  targetPercent,
  type DegreeClass,
  type GradeTargetConfig,
} from '@/lib/gradeTarget'
import { moduleStanding, overallOutlook, targetOutlook, type TargetOutlook } from '@/lib/grades'
import { useSampleData } from '@/lib/sampleData'
import { useAsync } from '@/lib/useAsync'

const pct = (n: number) => `${Math.round(n)}%`

function classLabel(mark: number, cfg: GradeTargetConfig): string {
  const cls = classOf(mark, cfg.boundaries)
  return cls ? DEGREE_CLASSES.find((c) => c.id === cls)!.label : 'below a Third'
}

/** The headline: what the rest of the degree needs, on average, for the target. */
function Headline({ outlook, cfg }: { outlook: TargetOutlook; cfg: GradeTargetConfig }) {
  const target = targetLabel(cfg)
  switch (outlook.kind) {
    case 'needs':
      return (
        <p>
          To get {target} overall you need <span className="text-lg font-semibold tabular-nums">{pct(outlook.needed)}</span> on
          average in what’s left.
        </p>
      )
    case 'secured':
      return <p>{target[0].toUpperCase() + target.slice(1)} is already secured, even with nothing more.</p>
    case 'unreachable':
      return (
        <p>
          {target[0].toUpperCase() + target.slice(1)} is out of reach: it would take {pct(outlook.needed)} on everything left.
        </p>
      )
    case 'final':
      return (
        <p>
          Everything is graded: <span className="font-semibold tabular-nums">{pct(outlook.achieved)}</span> overall (
          {classLabel(outlook.achieved, cfg)}).
        </p>
      )
  }
}

function OutlookBadge({ outlook, cfg }: { outlook: TargetOutlook; cfg: GradeTargetConfig }) {
  switch (outlook.kind) {
    case 'needs':
      return <Badge variant="outline">Need {pct(outlook.needed)}</Badge>
    case 'secured':
      return <Badge variant="secondary">Secured</Badge>
    case 'unreachable':
      return <Badge variant="destructive">Out of reach</Badge>
    case 'final':
      return (
        <Badge variant="outline">
          Final {pct(outlook.achieved)} · {classLabel(outlook.achieved, cfg)}
        </Badge>
      )
  }
}

/**
 * "To get a 2:1 overall you need 64% on average in what's left", then each module's own required
 * mark. Credit-weighted across modules, as the Progress ring is.
 */
export function GradeTargetWidget() {
  const [cfg] = useWidgetConfig(GRADE_TARGET_CONFIG)
  const { modules } = useOverview()
  const sample = useSampleData()
  const assignments = useAsync(
    () =>
      sample
        ? Promise.resolve([
            ...sample.module.assignments,
            ...sample.upcomingAssignments.filter((a) => a.module_id !== sample.module.id),
          ])
        : listAssignments(),
    [],
  )
  const target = targetPercent(cfg)

  const rows = useMemo(() => {
    const byModule = new Map<number, Assignment[]>()
    for (const a of assignments.data ?? []) byModule.set(a.module_id, [...(byModule.get(a.module_id) ?? []), a])
    return (modules.data ?? []).map((m) => {
      const own = byModule.get(m.id) ?? []
      return { module: m, standing: moduleStanding(own), outlook: targetOutlook(own, target) }
    })
  }, [assignments.data, modules.data, target])

  const overall = overallOutlook(
    rows.map((r) => ({ ...r.standing, credits: r.module.credits })),
    target,
  )

  return (
    <>
      {assignments.error && <WidgetError message="Couldn't load grades." onRetry={assignments.refetch} className="mb-2" />}
      <LoadSwap loading={assignments.loading || modules.loading} skeleton={<Skeleton className="h-32 w-full" />}>
        {assignments.data && modules.data && (
          <div className="flex flex-col gap-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a module to see what you need.</p>
            ) : (
              <>
                <div className="text-sm">
                  <Headline outlook={overall} cfg={cfg} />
                </div>
                <ul className="divide-y">
                  {rows.map(({ module: m, outlook }) => (
                    <li key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                      <Link to={`/modules/${m.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        {m.name}
                      </Link>
                      <OutlookBadge outlook={outlook} cfg={cfg} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </LoadSwap>
    </>
  )
}

export function GradeTargetSettings() {
  const [cfg, setCfg] = useWidgetConfig(GRADE_TARGET_CONFIG)
  const set = (patch: Partial<GradeTargetConfig>) => setCfg(GRADE_TARGET_CONFIG.normalize({ ...cfg, ...patch }))
  const setBoundary = (cls: DegreeClass, value: string) => set({ boundaries: { ...cfg.boundaries, [cls]: Number(value) } })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Aim for</Label>
        <Tabs value={cfg.target} onValueChange={(v) => set({ target: v as GradeTargetConfig['target'] })}>
          <TabsList className="w-full">
            {DEGREE_CLASSES.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.label}
              </TabsTrigger>
            ))}
            <TabsTrigger value="custom">%</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {cfg.target === 'custom' && (
        <div className="flex items-center gap-2">
          <Label htmlFor="grade-target-percent" className="font-normal">
            Target mark
          </Label>
          <Input
            id="grade-target-percent"
            type="number"
            min={0}
            max={100}
            className="w-20"
            value={cfg.percent}
            onChange={(e) => set({ percent: Number(e.target.value) })}
          />
          <span className="text-muted-foreground">%</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Class boundaries (%)</Label>
        <div className="grid grid-cols-4 gap-2">
          {DEGREE_CLASSES.map((c) => (
            <div key={c.id} className="flex flex-col gap-1">
              <Label htmlFor={`boundary-${c.id}`} className="text-xs font-normal text-muted-foreground">
                {c.label}
              </Label>
              <Input
                id={`boundary-${c.id}`}
                type="number"
                min={0}
                max={100}
                value={cfg.boundaries[c.id]}
                onChange={(e) => setBoundary(c.id, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
