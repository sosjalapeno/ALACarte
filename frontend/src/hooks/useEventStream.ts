import { useEffect, useRef } from 'react'

type Handler = (type: string, data: any) => void
export type EventStreamStatus = 'connecting' | 'open' | 'reconnecting'

type Options = {
  onStatusChange?: (status: EventStreamStatus) => void
}

export function useEventStream(handler: Handler, options?: Options) {
  const handlerRef = useRef(handler)
  const optionsRef = useRef(options)
  handlerRef.current = handler
  optionsRef.current = options

  useEffect(() => {
    let es: EventSource | null = null
    let backoff = 1000
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (cancelled) return
      optionsRef.current?.onStatusChange?.(
        backoff > 1000 ? 'reconnecting' : 'connecting',
      )
      es = new EventSource('/api/events')
      const onJobEvent = (type: string) => (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          handlerRef.current(type, data)
        } catch {}
      }
      es.addEventListener('job.created', onJobEvent('job.created'))
      es.addEventListener('job.update', onJobEvent('job.update'))
      es.addEventListener('job.log', onJobEvent('job.log'))
      es.addEventListener('wrapper.login', onJobEvent('wrapper.login'))
      es.addEventListener(
        'wrapper.login.log',
        onJobEvent('wrapper.login.log'),
      )
      es.onopen = () => {
        backoff = 1000
        optionsRef.current?.onStatusChange?.('open')
      }
      es.onerror = () => {
        es?.close()
        es = null
        if (cancelled) return
        optionsRef.current?.onStatusChange?.('reconnecting')
        timer = setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 30_000)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !es) connect()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    connect()
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (timer) clearTimeout(timer)
      es?.close()
      es = null
    }
  }, [])
}
