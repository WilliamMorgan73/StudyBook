import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface AsyncOptions {
  /**
   * When deps change, keep showing the previous data (with `loading` false) until the new
   * response arrives, instead of resetting to null. For paging through the same kind of
   * resource, e.g. calendar months.
   */
  keepPreviousData?: boolean
}

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  /** True only while a fetch is in flight and there's no data to show yet. */
  loading: boolean
  /**
   * Re-runs the current fetcher, keeping the current data until the response arrives. Stable
   * identity across renders; resolves (never rejects) once the fetch settles, after state updates.
   */
  refetch: () => Promise<void>
}

type LoadState<T> = Omit<AsyncState<T>, 'refetch'>

export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  { keepPreviousData = false }: AsyncOptions = {},
): AsyncState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true })

  const fetcherRef = useRef(fetcher)
  useLayoutEffect(() => {
    fetcherRef.current = fetcher
  })

  // Only the latest request may apply its result; bumping this discards everything in flight.
  const latestRequest = useRef(0)

  const load = useCallback((reset: boolean) => {
    const id = ++latestRequest.current
    setState((s) => {
      // Returning `s` unchanged where possible skips a redundant render (e.g. on mount).
      if (reset) return s.data === null && s.error === null && s.loading ? s : { data: null, error: null, loading: true }
      // A refresh with nothing on screen (e.g. after a failed first load) is effectively a first load.
      return s.data === null && !s.loading ? { ...s, loading: true } : s
    })
    return fetcherRef.current().then(
      (data) => {
        if (id === latestRequest.current) setState({ data, error: null, loading: false })
      },
      (error: Error) => {
        if (id === latestRequest.current) setState((s) => ({ data: s.data, error, loading: false }))
      },
    )
  }, [])

  useEffect(() => {
    void load(!keepPreviousData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    return () => {
      // A request counter, not a DOM ref, so reading the latest value at cleanup is the point.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      latestRequest.current++
    }
  }, [])

  const refetch = useCallback(() => load(false), [load])

  return { ...state, refetch }
}
