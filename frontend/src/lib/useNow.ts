import { useEffect, useState } from 'react'

import { nextTickDelay } from '@/lib/clock'

/** The current time, updated on each whole second (`seconds`) or whole minute. */
export function useNow(seconds: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, nextTickDelay(new Date(), seconds))
    }
    // Turning seconds on waits at most a second, since the first tick lands on the next whole one.
    schedule()
    return () => clearTimeout(timer)
  }, [seconds])
  return now
}
