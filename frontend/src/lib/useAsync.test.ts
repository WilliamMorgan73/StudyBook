// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAsync } from './useAsync'

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A fetcher whose every call returns a new deferred, settled via `calls[i]`. */
function controlledFetcher<T>() {
  const calls: ReturnType<typeof deferred<T>>[] = []
  const fetcher = vi.fn(() => {
    const d = deferred<T>()
    calls.push(d)
    return d.promise
  })
  return { fetcher, calls }
}

async function settle(fn: () => void) {
  await act(async () => {
    fn()
  })
}

describe('useAsync', () => {
  it('is loading on first load, then shows the data', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))

    expect(result.current).toMatchObject({ data: null, error: null, loading: true })

    await settle(() => calls[0].resolve('a'))
    expect(result.current).toMatchObject({ data: 'a', error: null, loading: false })
  })

  it('reports a first-load error with no data', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))

    const error = new Error('boom')
    await settle(() => calls[0].reject(error))
    expect(result.current).toMatchObject({ data: null, error, loading: false })
  })

  it('keeps the data visible and does not report loading during a refetch', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].resolve('a'))

    act(() => {
      void result.current.refetch()
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.current).toMatchObject({ data: 'a', loading: false })
  })

  it('replaces the data when a refetch succeeds', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].resolve('a'))

    act(() => {
      void result.current.refetch()
    })
    await settle(() => calls[1].resolve('b'))
    expect(result.current).toMatchObject({ data: 'b', error: null, loading: false })
  })

  it('keeps the data and sets the error when a refetch fails', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].resolve('a'))

    act(() => {
      void result.current.refetch()
    })
    const error = new Error('hiccup')
    await settle(() => calls[1].reject(error))
    expect(result.current).toMatchObject({ data: 'a', error, loading: false })
  })

  it('clears a previous error once a fetch succeeds', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].reject(new Error('boom')))

    act(() => {
      void result.current.refetch()
    })
    expect(result.current.loading).toBe(true)
    await settle(() => calls[1].resolve('a'))
    expect(result.current).toMatchObject({ data: 'a', error: null, loading: false })
  })

  it('settles an awaited refetch after the new data is visible', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].resolve('a'))

    let settled = false
    let done!: Promise<void>
    await act(async () => {
      done = result.current.refetch().then(() => {
        settled = true
      })
    })
    expect(settled).toBe(false)

    await act(async () => {
      calls[1].resolve('b')
      await done
    })
    expect(settled).toBe(true)
    expect(result.current.data).toBe('b')
  })

  it('resolves rather than rejects an awaited refetch that fails', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].resolve('a'))

    await act(async () => {
      const done = result.current.refetch()
      calls[1].reject(new Error('hiccup'))
      await expect(done).resolves.toBeUndefined()
    })
  })

  it('keeps the same refetch identity across re-renders', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result, rerender } = renderHook(() => useAsync(fetcher, []))
    const first = result.current.refetch

    await settle(() => calls[0].resolve('a'))
    rerender()
    expect(result.current.refetch).toBe(first)
  })

  it('refetches with the latest fetcher', async () => {
    const { result, rerender } = renderHook(({ value }) => useAsync(() => Promise.resolve(value), []), {
      initialProps: { value: 'a' },
    })
    await act(async () => {})
    rerender({ value: 'b' })

    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.data).toBe('b')
  })

  it('resets to loading when deps change', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result, rerender } = renderHook(({ id }) => useAsync(fetcher, [id]), { initialProps: { id: 1 } })
    await settle(() => calls[0].resolve('one'))

    rerender({ id: 2 })
    expect(result.current).toMatchObject({ data: null, loading: true })

    await settle(() => calls[1].resolve('two'))
    expect(result.current).toMatchObject({ data: 'two', loading: false })
  })

  it('keeps the previous data until the new data arrives with keepPreviousData', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result, rerender } = renderHook(({ id }) => useAsync(fetcher, [id], { keepPreviousData: true }), {
      initialProps: { id: 1 },
    })
    await settle(() => calls[0].resolve('one'))

    rerender({ id: 2 })
    expect(result.current).toMatchObject({ data: 'one', loading: false })

    await settle(() => calls[1].resolve('two'))
    expect(result.current).toMatchObject({ data: 'two', loading: false })
  })

  it('ignores an earlier deps change that resolves last', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result, rerender } = renderHook(({ id }) => useAsync(fetcher, [id], { keepPreviousData: true }), {
      initialProps: { id: 1 },
    })
    rerender({ id: 2 })

    await settle(() => calls[1].resolve('two'))
    await settle(() => calls[0].resolve('one'))
    expect(result.current.data).toBe('two')
  })

  it('ignores an earlier refetch that resolves last', async () => {
    const { fetcher, calls } = controlledFetcher<string>()
    const { result } = renderHook(() => useAsync(fetcher, []))
    await settle(() => calls[0].resolve('a'))

    act(() => {
      void result.current.refetch()
      void result.current.refetch()
    })
    await settle(() => calls[2].resolve('newest'))
    await settle(() => calls[1].resolve('older'))
    expect(result.current.data).toBe('newest')
  })

  it('does not update state after unmount', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { fetcher, calls } = controlledFetcher<string>()
    const { result, unmount } = renderHook(() => useAsync(fetcher, []))

    unmount()
    await settle(() => calls[0].resolve('a'))
    expect(result.current).toMatchObject({ data: null, loading: true })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
