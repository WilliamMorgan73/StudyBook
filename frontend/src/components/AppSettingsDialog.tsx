import { Database, Palette, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { updateAppSettings, type AppSettings, type Skin, type ThemeMode } from '@/lib/api'
import { applyTheme, SKINS } from '@/lib/theme'

type Category = 'appearance' | 'general' | 'ai' | 'data'

const CATEGORIES: { id: Category; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'ai', label: 'AI Integration', icon: Sparkles },
  { id: 'data', label: 'Data', icon: Database },
]

export function AppSettingsDialog({
  settings,
  open,
  onOpenChange,
  onChanged,
}: {
  settings: AppSettings
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [category, setCategory] = useState<Category>('appearance')
  const [maxCredits, setMaxCredits] = useState(settings.max_credits !== null ? String(settings.max_credits) : '')
  const [savingCredits, setSavingCredits] = useState(false)
  // Appearance changes apply immediately and are tracked locally rather than via the `settings`
  // prop: the parent refetches app settings through the same reloadKey used for the modules
  // list etc., which briefly nulls its data and would otherwise unmount this whole dialog.
  const [themeMode, setThemeMode] = useState(settings.theme_mode)
  const [skin, setSkin] = useState(settings.skin)

  useEffect(() => {
    if (open) {
      setCategory('appearance')
      setMaxCredits(settings.max_credits !== null ? String(settings.max_credits) : '')
      setThemeMode(settings.theme_mode)
      setSkin(settings.skin)
    }
  }, [open, settings.max_credits, settings.theme_mode, settings.skin])

  async function handleSaveCredits() {
    setSavingCredits(true)
    try {
      await updateAppSettings({ max_credits: maxCredits ? Number(maxCredits) : null })
      onChanged()
    } finally {
      setSavingCredits(false)
    }
  }

  async function handleThemeMode(mode: ThemeMode) {
    setThemeMode(mode)
    applyTheme(mode, skin)
    await updateAppSettings({ theme_mode: mode })
  }

  async function handleSkin(nextSkin: Skin) {
    setSkin(nextSkin)
    applyTheme(themeMode, nextSkin)
    await updateAppSettings({ skin: nextSkin })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[22rem]">
          <nav className="w-44 shrink-0 space-y-0.5 border-r bg-muted/30 p-2">
            {CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  category === id
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          <div className="flex-1 space-y-6 p-5">
            {category === 'appearance' && (
              <>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Tabs value={themeMode} onValueChange={(v) => handleThemeMode(v as ThemeMode)}>
                    <TabsList>
                      <TabsTrigger value="light">Light</TabsTrigger>
                      <TabsTrigger value="dark">Dark</TabsTrigger>
                      <TabsTrigger value="system">System</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-2">
                  <Label>Skin</Label>
                  <div className="flex flex-wrap gap-3">
                    {SKINS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSkin(s.id)}
                        aria-pressed={skin === s.id}
                        className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-shadow ${
                          skin === s.id ? 'ring-2 ring-foreground' : 'ring-1 ring-border hover:ring-foreground/40'
                        }`}
                      >
                        <span
                          className="flex size-12 items-center justify-center rounded-md"
                          style={{ backgroundColor: s.swatch.bg }}
                        >
                          <span className="size-5 rounded-full" style={{ backgroundColor: s.swatch.accent }} />
                        </span>
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {category === 'general' && (
              <div className="space-y-1.5">
                <Label htmlFor="max-credits">Max credits</Label>
                <Input
                  id="max-credits"
                  type="number"
                  min={0}
                  value={maxCredits}
                  onChange={(e) => setMaxCredits(e.target.value)}
                  placeholder="No limit"
                  className="max-w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Caps how many module credits you can take on at once. Leave blank for no limit.
                </p>
                <Button size="sm" onClick={handleSaveCredits} disabled={savingCredits} className="mt-1">
                  {savingCredits ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}

            {category === 'ai' && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">AI integration is coming soon</p>
                <p className="text-sm text-muted-foreground">
                  Note summarization, note-to-flashcard generation, revision scheduling, and semantic note search
                  using the Anthropic API are planned but not yet available.
                </p>
              </div>
            )}

            {category === 'data' && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Data export is coming soon</p>
                <p className="text-sm text-muted-foreground">
                  Exporting your notes, flashcards, and attachments as a backup isn't available yet.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
