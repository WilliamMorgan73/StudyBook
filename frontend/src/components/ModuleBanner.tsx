import type { ReactNode } from 'react'

import { Palette } from 'lucide-react'
import { motion } from 'motion/react'

import { Countdown } from '@/components/Countdown'
import { ModuleProgressRing } from '@/components/ModuleProgressRing'
import { AnimatedNumber } from '@/components/RadialProgress'
import { Button } from '@/components/ui/button'
import type { ModuleDetail } from '@/lib/api'
import { BANNER_TINTS, type BannerConfig, type BannerStatId } from '@/lib/moduleBanner'
import { fadeUpAt } from '@/lib/motion'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function percent(value: number | null, size: BannerConfig['size']) {
  if (value === null) return '—'
  return (
    <>
      <AnimatedNumber value={value} decimals={size === 'compact' ? 0 : 1} />%
    </>
  )
}

/** The next assignment of `kind` that's still ahead and, for coursework, not yet handed in. */
function nextDue(module: ModuleDetail, kind: 'exam' | 'coursework') {
  const now = Date.now()
  return (
    module.assignments
      .filter(
        (a) =>
          a.kind === kind &&
          a.due_at !== null &&
          new Date(a.due_at).getTime() > now &&
          (kind === 'exam' || (a.status !== 'submitted' && a.status !== 'graded')),
      )
      .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0] ?? null
  )
}

/** One stat: its value (a number or a countdown) over a label. */
function stat(module: ModuleDetail, id: BannerStatId, size: BannerConfig['size']): { value: ReactNode; label: string } {
  const countdownSize = size === 'compact' ? 'sm' : 'md'
  const number = (value: ReactNode) => (
    <p className={`font-semibold tabular-nums ${size === 'compact' ? 'text-base' : 'text-2xl'}`}>{value}</p>
  )
  switch (id) {
    case 'grade':
      return { value: number(percent(module.current_grade, size)), label: 'Current grade' }
    case 'achieved':
      return {
        value: number(percent(module.completion_progress.achieved_fraction * 100, size)),
        label: 'Achieved so far',
      }
    case 'nextLecture':
      return {
        value: <Countdown target={module.next_lecture_at} size={countdownSize} />,
        label: `Next lecture${module.next_lecture_at ? ` · ${formatDate(module.next_lecture_at)}` : ''}`,
      }
    case 'nextExam': {
      const exam = nextDue(module, 'exam')
      return {
        value: <Countdown target={exam?.due_at ?? null} size={countdownSize} />,
        label: exam ? `Exam · ${exam.title}` : 'Next exam',
      }
    }
    case 'nextDeadline': {
      const due = nextDue(module, 'coursework')
      return {
        value: <Countdown target={due?.due_at ?? null} noneLabel="Nothing due" arrivedLabel="Due now" size={countdownSize} />,
        label: due ? `Due · ${due.title}` : 'Next deadline',
      }
    }
    case 'cardsDue': {
      const due = module.flashcards.filter((f) => new Date(f.due_at) <= new Date()).length
      return { value: number(due), label: due === 1 ? 'Flashcard due' : 'Flashcards due' }
    }
    case 'credits':
      return { value: number(module.credits ?? '—'), label: 'Credits' }
  }
}

/**
 * The module-tinted bar at the top of the module page: progress ring, name and details, and the
 * stats `config` picks. While the layout is being edited, it offers "Customise banner".
 */
export function ModuleBanner({
  module,
  config,
  editing,
  onCustomise,
}: {
  module: ModuleDetail
  config: BannerConfig
  editing: boolean
  onCustomise: () => void
}) {
  const compact = config.size === 'compact'
  const details = [module.code, module.term, module.credits !== null ? `${module.credits} credits` : null].filter(Boolean)

  return (
    <motion.div
      className="shrink-0 border-b transition-colors"
      style={{ backgroundColor: `${module.color}${BANNER_TINTS[config.tint].alpha}` }}
      variants={fadeUpAt}
      custom={0}
    >
      <div className={`flex items-center px-6 ${compact ? 'gap-3 py-2' : 'gap-5 py-4'}`}>
        {config.ring && (
          <ModuleProgressRing
            progress={module.completion_progress}
            color={module.color}
            size={compact ? 32 : 56}
            strokeWidth={compact ? 4 : 7}
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className={`truncate font-semibold ${compact ? 'text-lg' : 'text-2xl'}`}>{module.name}</h1>
          {details.length > 0 && !compact && <p className="text-sm text-muted-foreground">{details.join(', ')}</p>}
        </div>
        {editing && (
          <Button variant="outline" size="sm" onClick={onCustomise} className="shrink-0">
            <Palette /> Customise banner
          </Button>
        )}
        {config.stats.length > 0 && (
          <div className={`flex shrink-0 text-right ${compact ? 'gap-6' : 'gap-8'}`}>
            {config.stats.map((id) => {
              const { value, label } = stat(module, id, config.size)
              return (
                <div key={id} className="flex max-w-48 flex-col items-end">
                  {value}
                  <p className={`truncate text-muted-foreground ${compact ? 'text-xs' : 'mt-0.5 text-sm'}`}>{label}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
