import { useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, error: null, loading: true })
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, error, loading: false })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}

/**
 * The most recent non-null `data`, kept on display while a refetch is in flight. `useAsync` nulls
 * `data` whenever its deps change, which unmounts lists mid-refetch and would replay their
 * enter animations (or drop exit animations) on every add/delete. Changing `resetKey` (e.g. the
 * route's id) drops the kept value, so one record's data never stands in for another's.
 */
export function useLastLoaded<T>(data: T | null, resetKey?: unknown): T | null {
  const [last, setLast] = useState<{ key: unknown; data: T | null }>({ key: resetKey, data })
  // Adjusting state during render (rather than in an effect) avoids rendering the stale value once.
  if (data !== null && (data !== last.data || resetKey !== last.key)) setLast({ key: resetKey, data })
  return data ?? (last.key === resetKey ? last.data : null)
}
