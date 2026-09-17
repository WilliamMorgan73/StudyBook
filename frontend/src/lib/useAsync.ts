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
