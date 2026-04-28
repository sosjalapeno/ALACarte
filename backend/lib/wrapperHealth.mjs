import net from 'node:net'

import { onEvent as subscribeEvent } from './eventBus.mjs'

const WRAPPER_HOST = process.env.AMDL_WRAPPER_HOST || '127.0.0.1'
const WRAPPER_PORTS = {
  decrypt: Number(process.env.AMDL_WRAPPER_DECRYPT_PORT || 10020),
  m3u8: Number(process.env.AMDL_WRAPPER_M3U8_PORT || 20020),
  account: Number(process.env.AMDL_WRAPPER_ACCOUNT_PORT || 30020),
}

const lastEventTs = {
  stallSuspectedAt: 0,
  stallAbortedAt: 0,
  downAt: 0,
}

subscribeEvent((evt) => {
  if (!evt) return
  if (evt.type === 'wrapper.stall.suspected') {
    const now = Date.now()
    lastEventTs.stallSuspectedAt = now
    if (evt.data?.phase === 'aborting') lastEventTs.stallAbortedAt = now
  }
  if (evt.type === 'wrapper.health' && evt.data?.ok === false) {
    lastEventTs.downAt = Date.now()
  }
})

export function getWrapperPorts() {
  return { host: WRAPPER_HOST, ...WRAPPER_PORTS }
}

export function getWrapperEventState() {
  return { ...lastEventTs }
}

export function probeTcp(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const finish = (ok, err) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, error: err || null })
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, 'timeout'))
    socket.once('error', (e) => finish(false, e.code || e.message))
    socket.connect(port, host)
  })
}

export async function probeWrapperPorts({ timeoutMs = 1500 } = {}) {
  const entries = Object.entries(WRAPPER_PORTS)
  const results = await Promise.all(
    entries.map(async ([name, port]) => {
      const r = await probeTcp(WRAPPER_HOST, port, timeoutMs)
      return [name, port, r]
    }),
  )
  const failed = results
    .filter(([, , r]) => !r.ok)
    .map(([name, port, r]) => ({ name, port, error: r.error }))
  return {
    ok: failed.length === 0,
    host: WRAPPER_HOST,
    failedPorts: failed,
    probes: Object.fromEntries(results.map(([name, port, r]) => [name, { port, ...r }])),
  }
}
