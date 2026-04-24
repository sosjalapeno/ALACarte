import { useEffect, useState } from 'react'

import { api, type PublicSettings } from '../api/client'

type Listener = (value: PublicSettings | null) => void

let cached: PublicSettings | null = null
let inflight: Promise<PublicSettings> | null = null
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l(cached)
}

async function loadSettings(): Promise<PublicSettings> {
  if (inflight) return inflight
  inflight = api
    .settings()
    .then((s) => {
      cached = s
      notify()
      return s
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function setAppSettingsCache(next: PublicSettings) {
  cached = next
  notify()
}

export function invalidateAppSettings() {
  cached = null
  void loadSettings().catch(() => {})
}

export function useAppSettings(): PublicSettings | null {
  const [value, setValue] = useState<PublicSettings | null>(cached)

  useEffect(() => {
    listeners.add(setValue)
    if (cached) setValue(cached)
    else void loadSettings().catch(() => {})
    return () => {
      listeners.delete(setValue)
    }
  }, [])

  return value
}
