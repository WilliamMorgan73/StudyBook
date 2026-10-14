import { Link } from 'react-router-dom'

import { useModuleData } from '@/components/dashboard/moduleContext'
import { useOverview } from '@/components/dashboard/overviewContext'
import { LoadSwap } from '@/components/LoadSwap'
import { StudySession } from '@/components/StudySession'
import { Skeleton } from '@/components/ui/skeleton'
import { WidgetError } from '@/components/WidgetError'
import { listWeakestTopics, type WeakTopic } from '@/lib/api'
import { weaknessLabel } from '@/lib/revision'
import { useSampleData, type SampleData } from '@/lib/sampleData'
import { useAsync } from '@/lib/useAsync'

const LIMIT = 5

const LABEL_CLASS = {
  Weak: 'text-destructive',
  Fair: 'text-muted-foreground',
  Strong: 'text-emerald-600 dark:text-emerald-400',
} as const

/** The sample module's topics, from weak to strong, for setup previews. */
function sampleTopics(sample: SampleData, moduleId?: number): WeakTopic[] {
  const scores = [0.74, 0.61, 0.48, 0.36, 0.22]
  return sample.module.submodules
    .filter(() => moduleId === undefined || moduleId === sample.module.id)
    .slice(0, LIMIT)
    .map((s, i) => ({
      id: s.id,
      title: s.title,
      module_id: sample.module.id,
      module_name: sample.module.name,
      weakness: scores[i],
      card_count: 6,
    }))
}

/** The topics whose cards lapse most (the revision planner's weakness scores), each with Study. */
function WeakestTopics({ moduleId, colorOf, showModule }: { moduleId?: number; colorOf: (id: number) => string; showModule: boolean }) {
  const sample = useSampleData()
  const topics = useAsync(
    () => (sample ? Promise.resolve(sampleTopics(sample, moduleId)) : listWeakestTopics({ limit: LIMIT, moduleId })),
    [moduleId],
  )
  return (
    <>
      {topics.error && <WidgetError message="Couldn't load topics." onRetry={topics.refetch} className="mb-2" />}
      <LoadSwap loading={topics.loading} skeleton={<Skeleton className="h-28 w-full" />}>
        {topics.data?.length === 0 && <p className="text-sm text-muted-foreground">No topics with flashcards yet.</p>}
        {topics.data && topics.data.length > 0 && (
          <ul className="divide-y">
            {topics.data.map((t) => {
              const label = weaknessLabel(t.weakness)
              const color = colorOf(t.module_id)
              return (
                <li key={t.id} className="flex items-center gap-2 py-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link to={`/modules/${t.module_id}/submodules/${t.id}`} className="block truncate text-sm font-medium hover:underline">
                      {t.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className={LABEL_CLASS[label]}>{label}</span>
                      {showModule && ` · ${t.module_name}`} · {t.card_count} card{t.card_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <StudySession scope={{ submoduleId: t.id }} title={t.title} color={color} onFinished={() => void topics.refetch()} />
                </li>
              )
            })}
          </ul>
        )}
      </LoadSwap>
    </>
  )
}

export function WeakestTopicsWidget() {
  const { moduleColor } = useOverview()
  return <WeakestTopics colorOf={moduleColor} showModule />
}

export function ModuleWeakestTopicsWidget() {
  const { module } = useModuleData()
  return <WeakestTopics moduleId={module.id} colorOf={() => module.color} showModule={false} />
}
