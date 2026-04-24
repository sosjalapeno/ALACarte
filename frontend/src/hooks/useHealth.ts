import { useEffect, useState } from 'react'

import { api, type HealthReport } from '../api/client'

export function useHealth(intervalMs = 15000) {
  const [health, setHealth] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const r = await api.health()
        if (!cancelled) {
          setHealth(r)
          setError(null)
          setLoading(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'failed')
          setLoading(false)
        }
      }
    }
    run()
    const t = setInterval(run, intervalMs)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [intervalMs])

  return { health, loading, error }
}
