import { useEffect, useRef, useState } from 'react'

import { api, type Job } from '../api/client'
import { useEventStream } from './useEventStream'

export function useQueue() {
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [loading, setLoading] = useState(true)
  const loadedRef = useRef(false)

  useEffect(() => {
    api
      .queue()
      .then((r) => {
        const map: Record<string, Job> = {}
        for (const j of r.jobs) map[j.id] = j
        setJobs(map)
        loadedRef.current = true
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEventStream((type, data) => {
    if (type === 'job.created' || type === 'job.update') {
      setJobs((prev) => ({ ...prev, [data.id]: { ...prev[data.id], ...data } }))
    }
  })

  const list = Object.values(jobs).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  )
  const active = list.filter(
    (j) => j.status === 'queued' || j.status === 'running',
  )
  const recent = list.filter((j) => j.status === 'done' || j.status === 'failed')

  return { jobs: list, active, recent, loading }
}
