import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { BookOpen, Eye, EyeOff, Settings } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { AddModuleDialog } from '@/components/AddModuleDialog'
import { AddModuleTile } from '@/components/AddModuleTile'
import { AppSettingsDialog } from '@/components/AppSettingsDialog'
import { AssignmentItem } from '@/components/AssignmentItem'
import { DaySwap } from '@/components/CalendarEffects'
import { EventMarker } from '@/components/EventMarker'
import { LoadSwap } from '@/components/LoadSwap'
import { calendarGridRange, MonthCalendar } from '@/components/MonthCalendar'
import { ModuleCard } from '@/components/ModuleCard'
import { PageHeader } from '@/components/PageHeader'
import { AnimatedNumber, RadialProgress } from '@/components/RadialProgress'
import { QuickNotepad } from '@/components/QuickNotepad'
import { QuickTodoList } from '@/components/QuickTodoList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getAppSettings, getCalendar, listModules, listUpcomingAssignments } from '@/lib/api'
import { calendarEventKey, visibleCalendarEvents } from '@/lib/busyTime'
import { enter, fadeUp, fadeUpAt, stagger } from '@/lib/motion'
import { progressRingSegments } from '@/lib/progress'
import { useAsync } from '@/lib/useAsync'

const MotionCard = motion.create(Card)

/** Height + fade for a panel that opens below its row. */
const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2 },
  style: { overflow: 'hidden' },
} as const

const SHOW_BUSY_KEY = 'studybook.overview.showBusy'

function readShowBusy() {
  try {
    return localStorage.getItem(SHOW_BUSY_KEY) !== 'false'
  } catch {
    return true
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function Overview() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selected, setSelected] = useState(() => new Date())
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null)
  // The module highlighted on the Progress ring, from hovering its arc or its legend row.
  const [activeModuleId, setActiveModuleId] = useState<number | null>(null)
  const [showBusy, setShowBusy] = useState(readShowBusy)

  function toggleShowBusy() {
    const next = !showBusy
    setShowBusy(next)
    try {
      localStorage.setItem(SHOW_BUSY_KEY, String(next))
    } catch {
      // Storage unavailable: the toggle still works for this visit.
    }
  }

  const gridRange = useMemo(() => calendarGridRange(month), [month])

  const modules = useAsync(() => listModules(), [])
  const assignments = useAsync(() => listUpcomingAssignments(6), [])
  // Keep the current month on screen until the next one loads, so paging doesn't blink.
  const calendar = useAsync(() => getCalendar(gridRange.start, gridRange.end), [gridRange], {
    keepPreviousData: true,
  })
  const appSettings = useAsync(() => getAppSettings(), [])

  // The dashboard cards enter one at a time in reading order.
  const slot = { calendar: 0, upcoming: 1, progress: 2, todo: 3, notepad: 4 }
  const cardMotion = (i: number) => ({ variants: fadeUpAt, custom: i })

  const maxCredits = appSettings.data?.max_credits ?? null
  const usedCredits = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 0), 0)
  const hasCreditRoom = maxCredits === null || usedCredits < maxCredits

  const moduleName = (id: number) => modules.data?.find((m) => m.id === id)?.name ?? 'Unknown module'
  const moduleColor = (id: number | null) =>
    modules.data?.find((m) => m.id === id)?.color ?? 'var(--muted-foreground)'

  const events = useMemo(() => visibleCalendarEvents(calendar.data ?? [], showBusy), [calendar.data, showBusy])
  const selectedDayEvents = useMemo(
    () => events.filter((e) => isSameDay(new Date(e.starts_at), selected)),
    [events, selected],
  )

  // Credit-weighted (falling back to equal weight when credits aren't set) so the aggregate ring
  // matches each module's own ring: achieved% of grade in the module's own color, the rest of
  // what's been submitted/graded but fell short of full marks in a faded shade of it.
  const totalWeight = (modules.data ?? []).reduce((sum, m) => sum + (m.credits ?? 1), 0)

  const progressSegments = useMemo(() => {
    if (totalWeight === 0) return []
    return (modules.data ?? []).flatMap((m) => {
      const share = (m.credits ?? 1) / totalWeight
      return progressRingSegments(m.completion_progress, m.color, share).map((s) => ({ ...s, id: m.id }))
    })
  }, [modules.data, totalWeight])

  const overallCompletion = useMemo(() => {
    if (totalWeight === 0) return { achieved: 0, completed: 0 }
    const totals = (modules.data ?? []).reduce(
      (acc, m) => {
        const weight = m.credits ?? 1
        return {
          achieved: acc.achieved + weight * m.completion_progress.achieved_fraction,
          completed: acc.completed + weight * m.completion_progress.completed_fraction,
        }
      },
      { achieved: 0, completed: 0 },
    )
    return { achieved: totals.achieved / totalWeight, completed: totals.completed / totalWeight }
  }, [modules.data, totalWeight])

  const legendModules = (modules.data ?? []).filter((m) => m.assignment_progress.total > 0)
  const activeModule = legendModules.find((m) => m.id === activeModuleId) ?? null

  return (
    <div className="min-h-full">
      <PageHeader
        left={
          <div className="flex items-center gap-2">
            <BookOpen className="size-6" />
            <span className="text-lg font-semibold">StudyBook</span>
          </div>
        }
        right={
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings /> Settings
          </Button>
        }
      />

      <div className="space-y-8 px-8 py-8">
        <motion.div className="grid gap-6 lg:grid-cols-4" {...enter}>
          <MotionCard className="lg:col-span-2" {...cardMotion(slot.calendar)}>
            <CardHeader>
              <CardTitle>Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {calendar.error && <p className="text-sm text-destructive">Couldn't load the calendar.</p>}
              <LoadSwap
                loading={calendar.loading}
                skeleton={<Skeleton className="h-80 w-full" />}
                className="space-y-3"
              >
                {calendar.data && (
                  <>
                    <MonthCalendar
                      month={month}
                      onMonthChange={setMonth}
                      events={events}
                      selected={selected}
                      onSelect={(date) => {
                        setSelected(date)
                        setExpandedEventKey(null)
                      }}
                      eventColor={(event) => moduleColor(event.module_id)}
                    />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <EventMarker kind="lecture" />
                        Lecture
                      </span>
                      <span className="flex items-center gap-1.5">
                        <EventMarker kind="assignment_due" />
                        Assignment due
                      </span>
                      <span className="flex items-center gap-1.5">
                        <EventMarker kind="exam" />
                        Exam
                      </span>
                      <button
                        type="button"
                        onClick={toggleShowBusy}
                        aria-pressed={showBusy}
                        title={showBusy ? 'Hide busy time' : 'Show busy time'}
                        className={`ml-auto flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground ${
                          showBusy ? '' : 'line-through opacity-60'
                        }`}
                      >
                        <EventMarker kind="busy" />
                        Busy
                        {showBusy ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      </button>
                    </div>
                    <div className="border-t pt-2">
                      <p className="mb-1.5 text-sm font-medium">
                        {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                      </p>
                      <div className="h-24 overflow-y-auto pr-1">
                        <DaySwap dayKey={selected.toDateString()}>
                          {selectedDayEvents.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nothing scheduled this day.</p>
                          ) : (
                            <ul className="space-y-1">
                              {selectedDayEvents.map((event) => {
                                const key = calendarEventKey(event)
                                const isExpanded = expandedEventKey === key
                                const isBusy = event.kind === 'busy'
                                return (
                                  <li key={key}>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedEventKey(isExpanded ? null : key)}
                                      className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                                    >
                                      <EventMarker
                                        kind={event.kind}
                                        color={moduleColor(event.module_id)}
                                        className="shrink-0"
                                      />
                                      <span className={`truncate ${isBusy ? 'text-muted-foreground' : ''}`}>{event.title}</span>
                                      {event.module_id !== null && (
                                        <span className="text-muted-foreground">{moduleName(event.module_id)}</span>
                                      )}
                                      <span className="ml-auto shrink-0 text-muted-foreground">
                                        {event.kind === 'assignment_due'
                                          ? 'Due'
                                          : new Date(event.starts_at).toLocaleTimeString(undefined, {
                                              hour: 'numeric',
                                              minute: '2-digit',
                                            })}
                                      </span>
                                    </button>
                                    <AnimatePresence initial={false}>
                                    {isExpanded && event.kind !== 'assignment_due' && (
                                      <motion.div {...reveal} className="ml-4 space-y-0.5 px-2 pb-2 text-xs text-muted-foreground">
                                        <p>
                                          {new Date(event.starts_at).toLocaleTimeString(undefined, {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                          })}
                                          {event.ends_at &&
                                            ` – ${new Date(event.ends_at).toLocaleTimeString(undefined, {
                                              hour: 'numeric',
                                              minute: '2-digit',
                                            })}`}
                                        </p>
                                        {event.location && <p>{event.location}</p>}
                                        {isBusy && <p>Personal event (Settings → Calendars)</p>}
                                        {event.url && (
                                          <Link to={event.url} className="inline-block text-foreground hover:underline">
                                            {event.kind === 'exam' ? 'Open exam' : 'Open module'} &rarr;
                                          </Link>
                                        )}
                                      </motion.div>
                                    )}
                                    {isExpanded && event.kind === 'assignment_due' && event.url && (
                                      <motion.div {...reveal} className="ml-4 space-y-0.5 px-2 pb-2 text-xs text-muted-foreground">
                                        <Link to={event.url} className="inline-block text-foreground hover:underline">
                                          Open assignment &rarr;
                                        </Link>
                                      </motion.div>
                                    )}
                                    </AnimatePresence>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </DaySwap>
                      </div>
                    </div>
                  </>
                )}
              </LoadSwap>
            </CardContent>
          </MotionCard>

          {/* At lg the side columns take the row height the Calendar card sets (h-0 keeps their own
              content out of the row sizing), so long lists scroll inside their cards instead. */}
          <div className="flex flex-col gap-6 lg:h-0 lg:min-h-full">
            <MotionCard className="min-h-0 flex-1" {...cardMotion(slot.upcoming)}>
              <CardHeader>
                <CardTitle>Upcoming assignments</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 min-h-0 flex-1 space-y-1 overflow-y-auto lg:max-h-none">
                {assignments.error && <p className="text-sm text-destructive">Couldn't load assignments.</p>}
                <LoadSwap loading={assignments.loading} skeleton={<Skeleton className="h-40 w-full" />}>
                  {assignments.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">{"Nothing due — you're all caught up."}</p>
                  )}
                  {assignments.data && assignments.data.length > 0 && (
                    <motion.div className="space-y-1" variants={stagger(0.04)} {...enter}>
                      {assignments.data.map((a) => (
                        <motion.div key={a.id} variants={fadeUp}>
                          <AssignmentItem assignment={a} moduleName={moduleName(a.module_id)} />
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </LoadSwap>
              </CardContent>
            </MotionCard>

            <MotionCard className="min-h-0 flex-1" {...cardMotion(slot.todo)}>
              <CardHeader>
                <CardTitle>To-do</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <QuickTodoList />
              </CardContent>
            </MotionCard>
          </div>

          {/* At lg the side columns take the row height the Calendar card sets (h-0 keeps their own
              content out of the row sizing), so long lists scroll inside their cards instead. */}
          <div className="flex flex-col gap-6 lg:h-0 lg:min-h-full">
            <MotionCard className="min-h-0 flex-1" {...cardMotion(slot.progress)}>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-center">
                <LoadSwap
                  loading={modules.loading}
                  skeleton={<Skeleton className="size-32 rounded-full" />}
                >
                  {modules.data && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative flex items-center justify-center">
                        <RadialProgress
                          segments={progressSegments}
                          size={136}
                          strokeWidth={13}
                          activeId={activeModuleId}
                          onActiveChange={(id) => setActiveModuleId(id as number | null)}
                        />

                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                          <p className="text-3xl font-semibold tabular-nums">
                            {totalWeight === 0 ? (
                              '—'
                            ) : (
                              <>
                                <AnimatedNumber
                                  value={Math.round(
                                    (activeModule?.completion_progress.achieved_fraction ?? overallCompletion.achieved) * 100,
                                  )}
                                />
                                %
                              </>
                            )}
                          </p>
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                              key={activeModule?.id ?? 'overall'}
                              initial={{ opacity: 0, y: 3 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -3 }}
                              transition={{ duration: 0.12 }}
                              className="w-full text-xs"
                            >
                              {activeModule ? (
                                <>
                                  <p className="truncate font-medium" style={{ color: activeModule.color }}>
                                    {activeModule.name}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {Math.round(activeModule.completion_progress.completed_fraction * 100)}% submitted
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-muted-foreground">achieved</p>
                                  {totalWeight > 0 && (
                                    <p className="text-muted-foreground/70">
                                      {Math.round(overallCompletion.completed * 100)}% submitted
                                    </p>
                                  )}
                                </>
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      </div>

                      {totalWeight === 0 ? (
                        <p className="text-xs text-muted-foreground">No modules yet.</p>
                      ) : (
                        <ul
                          className="flex flex-wrap justify-center gap-x-1 gap-y-0.5 text-xs"
                          onPointerLeave={() => setActiveModuleId(null)}
                        >
                          {legendModules.map((m) => (
                            <li key={m.id}>
                              <button
                                type="button"
                                onPointerEnter={() => setActiveModuleId(m.id)}
                                onFocus={() => setActiveModuleId(m.id)}
                                onBlur={() => setActiveModuleId(null)}
                                className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-opacity ${
                                  activeModuleId !== null && activeModuleId !== m.id ? 'opacity-40' : ''
                                }`}
                              >
                                <span
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: m.color }}
                                  aria-hidden
                                />
                                <span>{m.name}</span>
                                <span className="text-muted-foreground tabular-nums">
                                  {Math.round(m.completion_progress.achieved_fraction * 100)}%
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </LoadSwap>
              </CardContent>
            </MotionCard>

            <MotionCard className="min-h-0 flex-1" {...cardMotion(slot.notepad)}>
              <CardHeader>
                <CardTitle>Notepad</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <QuickNotepad />
              </CardContent>
            </MotionCard>
          </div>
        </motion.div>

        <section>
          <h2 className="mb-3 text-lg font-medium">Modules</h2>
          {modules.error && <p className="text-sm text-destructive">Couldn't load modules.</p>}
          <LoadSwap
            loading={modules.loading}
            skeleton={
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full" />
                  ))}
                </div>
              }
            >
            {modules.data && (
              <motion.div
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                variants={stagger()}
                {...enter}
              >
                {modules.data.map((m) => (
                  <motion.div key={m.id} variants={fadeUp} whileHover={{ y: -2 }}>
                    <ModuleCard module={m} maxCredits={maxCredits} />
                  </motion.div>
                ))}
                {hasCreditRoom && (
                  <motion.div variants={fadeUp} whileHover={{ y: -2 }}>
                    <AddModuleDialog onCreated={modules.refetch} trigger={<AddModuleTile />} />
                  </motion.div>
                )}
              </motion.div>
            )}
          </LoadSwap>
        </section>
      </div>

      {appSettings.data && (
        <AppSettingsDialog
          settings={appSettings.data}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onChanged={appSettings.refetch}
          onCalendarChanged={calendar.refetch}
        />
      )}
    </div>
  )
}
