import { Check, Eye, Plus, RotateCcw, WifiOff, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { AISettingsPanel } from '@/components/AISettingsPanel'
import { RestoreBackup } from '@/components/BackupSettings'
import { CalendarFeedsSettings } from '@/components/CalendarFeedsSettings'
import { ErrorState } from '@/components/ErrorState'
import { LayoutPreviewDialog } from '@/components/setup/LayoutPreview'
import { ColorSwatchPicker } from '@/components/ColorSwatchPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { pickAISettings, type AISettingsState } from '@/lib/ai'
import {
  createModule,
  deleteModule,
  getAppSettings,
  listModules,
  updateAppSettings,
  type AppSettings,
  type ModuleSummary,
  type Skin,
  type ThemeMode,
} from '@/lib/api'
import { MODULE_COLOR_SWATCHES } from '@/lib/colors'
import {
  DEFAULT_LAYOUT,
  normalizeLayout,
  OVERVIEW_BOARD,
  OVERVIEW_LAYOUT_PRESETS,
  sameLayout,
  WIDGETS,
  type LayoutItem,
} from '@/lib/dashboardLayout'
import { MODULE_DEFAULT_LAYOUT, MODULE_LAYOUT_PRESETS, MODULE_WIDGETS, moduleBoard } from '@/lib/moduleLayout'
import { applyTheme, SKINS } from '@/lib/theme'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

type StepId = 'appearance' | 'modules' | 'layout' | 'overview' | 'ai' | 'calendars'

const STEPS: { id: StepId; label: string; title: string; intro: string }[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    title: 'How should StudyBook look?',
    intro: 'Pick a theme and a skin. You can change both later in Settings.',
  },
  {
    id: 'modules',
    label: 'Modules',
    title: 'Add the modules you’re taking',
    intro: 'One per course. Topics, assignments and flashcards all live inside a module.',
  },
  {
    id: 'layout',
    label: 'Module layout',
    title: 'Choose a starting layout for module pages',
    intro: 'Every module starts with this. Rearrange any of them later with Edit layout.',
  },
  {
    id: 'overview',
    label: 'Overview',
    title: 'And for the Overview',
    intro: 'The Overview is your home page: the calendar and what’s due across every module.',
  },
  {
    id: 'ai',
    label: 'AI',
    title: 'Turn on the study assistant',
    intro: 'Optional. With an API key, StudyBook can write flashcards, summaries and revision guidance from your notes.',
  },
  {
    id: 'calendars',
    label: 'Calendars',
    title: 'Bring in your timetable',
    intro: 'Optional. Add your university calendar so lectures and busy time show up, and revision is planned around them.',
  },
]

/**
 * First-run setup: appearance, modules, the default module layout, AI and calendars. Every step
 * can be skipped, and so can the whole thing. Finishing (or skipping) marks setup complete, which
 * stops App redirecting here.
 */
export function SetupPage({ onFinished }: { onFinished: () => Promise<void> }) {
  const settings = useAsync(() => getAppSettings(), [])

  if (!settings.data) {
    if (settings.error) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <ErrorState
            icon={WifiOff}
            iconVariant="warning"
            badge="Server offline"
            title="Cannot connect to StudyBook server"
            description="Setup requires a running StudyBook backend server. Make sure the server is running, then try again."
            codeSnippet="uv run uvicorn app.main:app"
            primaryAction={{
              label: 'Retry connection',
              onClick: settings.refetch,
              icon: RotateCcw,
            }}
          />
        </div>
      )
    }

    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 px-6 py-12">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  return <Setup settings={settings.data} onFinished={onFinished} />
}

function Setup({ settings, onFinished }: { settings: AppSettings; onFinished: () => Promise<void> }) {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const modules = useAsync(() => listModules(), [])
  const step = STEPS[stepIndex]
  const last = stepIndex === STEPS.length - 1
  // The first module's colour tints the layout previews, so they look like that module's page.
  const accent = modules.data?.[0]?.color ?? MODULE_COLOR_SWATCHES[0]

  async function finish() {
    setFinishing(true)
    try {
      await updateAppSettings({ setup_completed: true })
      await onFinished()
      navigate('/', { replace: true })
    } finally {
      setFinishing(false)
    }
  }

  function next() {
    if (last) void finish()
    else setStepIndex((i) => i + 1)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <span className="font-medium">Set up StudyBook</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setRestoreOpen(true)}>
            Restore from a backup
          </Button>
          <Button variant="ghost" size="sm" onClick={finish} disabled={finishing}>
            Skip setup
          </Button>
        </div>
      </header>

      {/* A restored backup brings its own settings (setup done, usually), so the app reloads from `/`. */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore from a backup</DialogTitle>
            <DialogDescription>
              Moving from another computer, or reinstalling? Pick a backup downloaded from Settings → Data. It replaces anything set up here so far.
            </DialogDescription>
          </DialogHeader>
          <RestoreBackup showHeading={false} />
        </DialogContent>
      </Dialog>

      {/* Fits the viewport: steps fill what's left under the title, and only a list or a long
          panel scrolls, inside itself. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full max-w-5xl flex-col px-6 pt-8 pb-4">
          <ol className="mb-6 flex shrink-0 flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStepIndex(i)}
                  aria-current={i === stepIndex ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    i === stepIndex ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums',
                      i < stepIndex && 'border-transparent bg-foreground text-background',
                      i === stepIndex && 'border-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>

          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={step.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              aria-labelledby="setup-step-title"
              className="flex min-h-0 flex-1 flex-col"
            >
              <h1 id="setup-step-title" className="text-3xl font-semibold tracking-tight text-balance">
                {step.title}
              </h1>
              <p className="mt-2 max-w-prose shrink-0 text-muted-foreground">{step.intro}</p>
              <div className="mt-6 min-h-0 flex-1">
                {step.id === 'appearance' && <AppearanceStep settings={settings} />}
                {step.id === 'modules' && <ModulesStep modules={modules.data} onChanged={modules.refetch} />}
                {step.id === 'layout' && <LayoutStep page="module" settings={settings} accent={accent} />}
                {step.id === 'overview' && <LayoutStep page="overview" settings={settings} accent={accent} />}
                {step.id === 'ai' && (
                  <div className="h-full max-w-3xl overflow-y-auto pr-1">
                    <AIStep settings={settings} />
                  </div>
                )}
                {step.id === 'calendars' && (
                  <div className="h-full max-w-3xl overflow-y-auto pr-1">
                    <CalendarFeedsSettings onChanged={() => {}} />
                  </div>
                )}
              </div>
            </motion.section>
          </AnimatePresence>
        </div>
      </div>

      <footer className="border-t px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <Button variant="ghost" onClick={() => setStepIndex((i) => i - 1)} disabled={stepIndex === 0}>
            Back
          </Button>
          <span className="ml-auto" />
          {!last && (
            <Button variant="ghost" onClick={next}>
              Skip this step
            </Button>
          )}
          <Button onClick={next} disabled={finishing}>
            {last ? (finishing ? 'Finishing…' : 'Finish setup') : 'Continue'}
          </Button>
        </div>
      </footer>
    </div>
  )
}

function AppearanceStep({ settings }: { settings: AppSettings }) {
  // Applied straight away, so the rest of setup is in the chosen look.
  const [themeMode, setThemeMode] = useState(settings.theme_mode)
  const [skin, setSkin] = useState(settings.skin)

  function choose(mode: ThemeMode, nextSkin: Skin) {
    setThemeMode(mode)
    setSkin(nextSkin)
    applyTheme(mode, nextSkin)
    void updateAppSettings({ theme_mode: mode, skin: nextSkin })
  }

  return (
    <div className="space-y-8">
      <Field label="Theme">
        <Tabs value={themeMode} onValueChange={(v) => choose(v as ThemeMode, skin)}>
          <TabsList>
            <TabsTrigger value="light">Light</TabsTrigger>
            <TabsTrigger value="dark">Dark</TabsTrigger>
            <TabsTrigger value="system">Match my system</TabsTrigger>
          </TabsList>
        </Tabs>
      </Field>
      <Field label="Skin">
        <div className="flex flex-wrap gap-3">
          {SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(themeMode, s.id)}
              aria-pressed={skin === s.id}
              className={cn(
                'flex w-28 flex-col gap-2 rounded-xl p-2 text-left transition-shadow',
                skin === s.id ? 'ring-2 ring-foreground' : 'ring-1 ring-border hover:ring-foreground/40',
              )}
            >
              <span className="flex h-16 flex-col justify-end gap-1 rounded-lg p-2" style={{ backgroundColor: s.swatch.bg }}>
                <span className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: s.swatch.fg }} />
                <span className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: s.swatch.accent, opacity: 0.6 }} />
              </span>
              <span className="text-sm">{s.label}</span>
            </button>
          ))}
        </div>
      </Field>
    </div>
  )
}

function ModulesStep({ modules, onChanged }: { modules: ModuleSummary[] | null; onChanged: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [credits, setCredits] = useState('')
  const [color, setColor] = useState(MODULE_COLOR_SWATCHES[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only modules added here can be removed here: deleting one deletes everything in it, so a
  // module from before (setup run again from Settings) is never one click away from that.
  const [addedIds, setAddedIds] = useState<number[]>([])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Give the module a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createModule({
        name: name.trim(),
        code: code.trim() || null,
        credits: credits ? Number(credits) : null,
        color,
      })
      setAddedIds((ids) => [...ids, created.id])
      await onChanged()
      setName('')
      setCode('')
      setCredits('')
      // A different colour for the next one, so modules are easy to tell apart.
      setColor(MODULE_COLOR_SWATCHES[(MODULE_COLOR_SWATCHES.indexOf(color) + 1) % MODULE_COLOR_SWATCHES.length])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the module.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: number) {
    await deleteModule(id)
    setAddedIds((ids) => ids.filter((x) => x !== id))
    await onChanged()
  }

  return (
    <div className="flex h-full max-w-3xl flex-col gap-4">
      <form onSubmit={handleAdd} className="shrink-0 space-y-4 rounded-xl bg-muted/40 p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_6rem]">
          <div className="space-y-1.5">
            <Label htmlFor="setup-module-name">Name</Label>
            <Input
              id="setup-module-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Algorithms and Data Structures"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-module-code">Course code</Label>
            <Input id="setup-module-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="COMP2011" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setup-module-credits">Credits</Label>
            <Input
              id="setup-module-credits"
              type="number"
              min={0}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              placeholder="20"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ColorSwatchPicker value={color} onChange={setColor} />
          <Button type="submit" disabled={saving}>
            <Plus /> {saving ? 'Adding…' : 'Add module'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {modules && modules.length > 0 ? (
        <ul className="min-h-0 divide-y overflow-y-auto rounded-xl border">
          <AnimatePresence initial={false}>
            {modules.map((m) => (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.code && <span className="text-sm text-muted-foreground">{m.code}</span>}
                  {addedIds.includes(m.id) ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => handleRemove(m.id)}>
                      <X />
                    </Button>
                  ) : (
                    <span className="size-7" />
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="shrink-0 text-sm text-muted-foreground">
          No modules yet. Add one above, or skip this and add them from the Overview.
        </p>
      )}
      <p className="shrink-0 text-sm text-muted-foreground">
        Add lectures, assignments and topics from each module’s page once you’re in.
      </p>
    </div>
  )
}

/**
 * Pick a starting layout for module pages (`default_module_layout`) or the Overview
 * (`dashboard_layout`), each drawn as a to-scale map, and preview the pick full of sample data.
 */
function LayoutStep({ page, settings, accent }: { page: 'module' | 'overview'; settings: AppSettings; accent: string }) {
  const presets: LayoutPreset[] = page === 'module' ? MODULE_LAYOUT_PRESETS : OVERVIEW_LAYOUT_PRESETS
  const builtIn = page === 'module' ? MODULE_DEFAULT_LAYOUT : DEFAULT_LAYOUT
  const titles: Record<string, string> = Object.fromEntries(
    Object.entries(page === 'module' ? MODULE_WIDGETS : WIDGETS).map(([id, info]) => [id, info.title]),
  )
  const [chosen, setChosen] = useState<LayoutItem<string>[]>(() =>
    page === 'module'
      ? moduleBoard(settings.default_module_layout).defaultLayout
      : normalizeLayout(OVERVIEW_BOARD, settings.dashboard_layout),
  )
  const [error, setError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const chosenPreset = presets.find((p) => sameLayout(chosen, p.layout))

  async function choose(layout: LayoutItem<string>[]) {
    const previous = chosen
    setChosen(layout)
    setError(null)
    // The built-in layout is stored as null, so later changes to it reach this user too.
    const value = sameLayout(layout, builtIn) ? null : layout
    try {
      await updateAppSettings(page === 'module' ? { default_module_layout: value } : { dashboard_layout: value })
    } catch {
      setChosen(previous)
      setError("Couldn't save that layout. Try again.")
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
        <p className="text-sm">
          {chosenPreset ? (
            <>
              Chosen: <span className="font-medium">{chosenPreset.label}</span>
            </>
          ) : (
            'Your current layout'
          )}
        </p>
        <Button variant="outline" size="sm" onClick={() => setPreviewing(true)}>
          <Eye /> Preview with sample data
        </Button>
      </div>
      {/* One row of four on a wide screen; on a narrow one the grid scrolls inside itself. */}
      <div className="grid min-h-0 content-start gap-3 overflow-y-auto p-0.5 sm:grid-cols-2 lg:grid-cols-4">
        {presets.map((preset) => {
          const selected = sameLayout(chosen, preset.layout)
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(preset.layout)}
              className={cn(
                'space-y-3 rounded-xl p-3 text-left transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                selected ? 'ring-2 ring-foreground' : 'ring-1 ring-border hover:ring-foreground/40',
              )}
            >
              <LayoutThumbnail layout={preset.layout} titles={titles} accent={accent} />
              <span className="block">
                <span className="flex items-center gap-2 font-medium">
                  {preset.label}
                  {selected && <Check className="size-4" aria-hidden />}
                </span>
                <span className="block text-xs text-muted-foreground">{preset.description}</span>
              </span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <LayoutPreviewDialog
        open={previewing}
        onOpenChange={setPreviewing}
        page={page}
        layout={chosen}
        accent={accent}
        label={chosenPreset?.label ?? 'Your'}
        settings={settings}
      />
    </div>
  )
}

interface LayoutPreset {
  id: string
  label: string
  description: string
  layout: LayoutItem<string>[]
}

/** A to-scale map of a page layout (12 × 14 grid), each widget a labelled block. */
function LayoutThumbnail({
  layout,
  titles,
  accent,
}: {
  layout: LayoutItem<string>[]
  titles: Record<string, string>
  accent: string
}) {
  return (
    <span
      className="grid aspect-[12/10] w-full gap-1 rounded-lg bg-muted p-1.5"
      style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gridTemplateRows: 'repeat(14, minmax(0, 1fr))' }}
      aria-hidden
    >
      {layout.map((item) => (
        <span
          key={item.i}
          className="flex min-h-0 min-w-0 items-start overflow-hidden rounded-[5px] p-1 text-[10px] leading-tight"
          style={{
            gridColumn: `${item.x + 1} / span ${item.w}`,
            gridRow: `${item.y + 1} / span ${item.h}`,
            backgroundColor: `color-mix(in oklab, ${accent} 26%, var(--card))`,
            boxShadow: `inset 0 3px 0 ${accent}`,
          }}
        >
          <span className="truncate text-foreground/80">{titles[item.i]}</span>
        </span>
      ))}
    </span>
  )
}

function AIStep({ settings }: { settings: AppSettings }) {
  const [ai, setAI] = useState<AISettingsState>(() => pickAISettings(settings))
  return <AISettingsPanel settings={ai} onSaved={setAI} />
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
