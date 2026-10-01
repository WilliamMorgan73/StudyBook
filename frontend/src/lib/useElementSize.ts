import { useCallback, useState } from 'react'

/**
 * An element's content-box size, kept current with a ResizeObserver. For sizes that must be
 * numbers (an SVG's `size` prop); plain layout should use container queries instead. Both
 * dimensions are 0 until the element mounts.
 */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 })

  // A callback ref, so the observer follows the element if it remounts.
  const ref = useCallback((node: T | null) => {
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}
