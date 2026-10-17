import { useEffect, useState } from 'react'

/** Huidige tijd, ververst elke `intervalMs`. In tests te besturen met vi.useFakeTimers. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
