import express from 'express'

import { onEvent } from '../lib/eventBus.mjs'

export const eventsRouter = express.Router()

eventsRouter.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  res.write(`: connected\n\n`)
  const heartbeat = setInterval(() => {
    res.write(`: hb\n\n`)
  }, 20_000)

  const off = onEvent((ev) => {
    try {
      res.write(`event: ${ev.type}\n`)
      res.write(`data: ${JSON.stringify(ev.data)}\n\n`)
    } catch {}
  })

  req.on('close', () => {
    clearInterval(heartbeat)
    off()
    try {
      res.end()
    } catch {}
  })
})
