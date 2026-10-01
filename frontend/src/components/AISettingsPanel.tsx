import { CheckCircle2, CircleAlert, KeyRound, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { aiErrorMessage, pickAISettings, type AISettingsState } from '@/lib/ai'
import {
  listAIModels,
  testAIConnection,
  updateAppSettings,
  type AIProvider,
  type AppSettingsUpdate,
} from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

const PROVIDERS: Record<
  AIProvider,
  {
    tab: string
    keyLabel: string
    keyField: 'anthropic_api_key' | 'gemini_api_key'
    hasKey: 'has_anthropic_api_key' | 'has_gemini_api_key'
    placeholder: string
    envVar: string
  }
> = {
  anthropic: {
    tab: 'Claude',
    keyLabel: 'Anthropic API key',
    keyField: 'anthropic_api_key',
    hasKey: 'has_anthropic_api_key',
    placeholder: 'sk-ant-…',
    envVar: 'ANTHROPIC_API_KEY',
  },
  gemini: {
    tab: 'Gemini',
    keyLabel: 'Gemini API key',
    keyField: 'gemini_api_key',
    hasKey: 'has_gemini_api_key',
    placeholder: 'AIza…',
    envVar: 'GEMINI_API_KEY',
  },
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; message: string } | { status: 'error'; message: string }

/**
 * Settings → AI Integration. The provider follows the selected model: switching provider selects
 * that provider's first (recommended) model. Each provider keeps its own key, so switching back
 * and forth needs no re-entry. Key inputs are write-only: the backend never returns a key, only
 * `has_*_api_key`, so the field always starts empty and saving replaces whatever is stored.
 */
export function AISettingsPanel({
  settings,
  onSaved,
}: {
  settings: AISettingsState
  onSaved: (next: AISettingsState) => void
}) {
  const models = useAsync(() => listAIModels(), [])
  const [keyDraft, setKeyDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  const provider = PROVIDERS[settings.ai_provider]
  const hasKey = settings[provider.hasKey]
  const providerModels = models.data?.filter((m) => m.provider === settings.ai_provider)

  async function save(update: AppSettingsUpdate) {
    setSaving(true)
    setSaveError(null)
    setTest({ status: 'idle' })
    try {
      onSaved(pickAISettings(await updateAppSettings(update)))
      return true
    } catch (error) {
      setSaveError(aiErrorMessage(error))
      return false
    } finally {
      setSaving(false)
    }
  }

  function handleProvider(next: AIProvider) {
    const model = models.data?.find((m) => m.provider === next)
    if (!model || next === settings.ai_provider) return
    setKeyDraft('')
    void save({ ai_model: model.id })
  }

  async function handleSaveKey(event: FormEvent) {
    event.preventDefault()
    if (!keyDraft.trim()) return
    if (await save({ [provider.keyField]: keyDraft.trim() })) setKeyDraft('')
  }

  async function handleTest() {
    setTest({ status: 'testing' })
    try {
      const result = await testAIConnection()
      const label = models.data?.find((m) => m.id === result.model)?.label ?? result.model
      setTest({ status: 'ok', message: `Connected. ${label} is ready to use.` })
    } catch (error) {
      setTest({ status: 'error', message: aiErrorMessage(error) })
    }
  }

  const keyStatus = hasKey
    ? 'A key is saved.'
    : settings.ai_enabled
      ? `Using the key from the backend environment (${provider.envVar}). A key saved here takes precedence.`
      : 'No key set. AI features are turned off until you add one.'

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        AI features (flashcard generation, summaries, revision guidance) call Claude or Gemini through your own API
        key. Everything else works without one.
      </p>

      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Tabs value={settings.ai_provider} onValueChange={(v) => handleProvider(v as AIProvider)}>
          <TabsList>
            {(Object.keys(PROVIDERS) as AIProvider[]).map((id) => (
              <TabsTrigger key={id} value={id} disabled={saving || !models.data}>
                {PROVIDERS[id].tab}
                {settings[PROVIDERS[id].hasKey] && (
                  <KeyRound className="size-3.5 text-muted-foreground" aria-label="key saved" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">Each provider keeps its own key, so you can switch freely.</p>
      </div>

      <form onSubmit={handleSaveKey} className="space-y-1.5">
        <Label htmlFor="ai-api-key">{provider.keyLabel}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="ai-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder={hasKey ? '•••••••••••• (paste to replace)' : provider.placeholder}
            className="font-mono"
          />
          <Button type="submit" size="sm" disabled={saving || !keyDraft.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {hasKey && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => save({ [provider.keyField]: null })}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KeyRound className="size-3.5 shrink-0" />
          {keyStatus}
        </p>
        <p className="text-xs text-muted-foreground">
          Stored only in your local StudyBook database and never shown again after saving.
        </p>
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      </form>

      <div className="space-y-1.5">
        <Label htmlFor="ai-model">Model</Label>
        <Select
          value={settings.ai_model}
          onValueChange={(model) => save({ ai_model: model })}
          disabled={saving || !models.data}
        >
          <SelectTrigger id="ai-model" className="w-full max-w-sm">
            <SelectValue placeholder="Loading models…" />
          </SelectTrigger>
          <SelectContent>
            {providerModels?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {models.data?.find((m) => m.id === settings.ai_model)?.description ??
            'Used for every AI feature.'}
        </p>
      </div>

      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          disabled={!settings.ai_enabled || saving || test.status === 'testing'}
        >
          {test.status === 'testing' && <Loader2 className="animate-spin" />}
          {test.status === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
        {!settings.ai_enabled && <p className="text-xs text-muted-foreground">Add a key first to test it.</p>}
        {test.status === 'ok' && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400" role="status">
            <CheckCircle2 className="size-4 shrink-0" />
            {test.message}
          </p>
        )}
        {test.status === 'error' && (
          <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {test.message}
          </p>
        )}
      </div>
    </div>
  )
}
