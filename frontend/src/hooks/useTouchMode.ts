import { useMemo } from 'react'

function detectTouchMode(): boolean {
  if (typeof window === 'undefined') return false

  const coarsePointer =
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(any-pointer: coarse)').matches

  const touchPoints =
    typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

  const touchEvent = 'ontouchstart' in window

  return coarsePointer || touchPoints || touchEvent
}

export function useTouchMode(): boolean {
  return useMemo(() => detectTouchMode(), [])
}
