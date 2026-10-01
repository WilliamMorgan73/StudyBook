import { ApiError, getAppSettings, type AppSettings } from '@/lib/api'
import { useAsync } from '@/lib/useAsync'

/** Where AI actions point the student when no key is set. */
export const AI_SETTINGS_HINT = 'Add an API key in Settings → AI Integration to use this.'

/**
 * The backend reports AI failures as `{ detail, kind }`, with `detail` already readable
 * (bad key, rate limit, network, outage). This keeps that message and covers the cases where
 * the request never reached the backend.
 */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  // fetch() rejects with a TypeError when the backend itself is unreachable.
  if (error instanceof TypeError) return "Couldn't reach the StudyBook backend. Is it running?"
  if (error instanceof Error && error.message) return error.message
  return 'The AI request failed. Try again.'
}

/** Whether AI actions can run: `null` while loading, then `ai_enabled` from settings. */
export function useAIEnabled(): boolean | null {
  const { data, error } = useAsync(() => getAppSettings(), [])
  if (error) return false
  return data ? data.ai_enabled : null
}

/** The AI slice of settings that Settings → AI Integration edits. */
export type AISettingsState = Pick<
  AppSettings,
  'ai_provider' | 'has_anthropic_api_key' | 'has_gemini_api_key' | 'ai_enabled' | 'ai_model'
>

export function pickAISettings(settings: AppSettings): AISettingsState {
  const { ai_provider, has_anthropic_api_key, has_gemini_api_key, ai_enabled, ai_model } = settings
  return { ai_provider, has_anthropic_api_key, has_gemini_api_key, ai_enabled, ai_model }
}
