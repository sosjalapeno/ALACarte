import express from 'express'
import net from 'node:net'
import fs from 'node:fs'
import { spawn } from 'node:child_process'

import { getBearerToken } from '../lib/appleToken.mjs'

export const healthRouter = express.Router()

const WRAPPER_HOST = process.env.AMDL_WRAPPER_HOST || '127.0.0.1'
const WRAPPER_PORTS = {
  decrypt: Number(process.env.AMDL_WRAPPER_DECRYPT_PORT || 10020),
  m3u8: Number(process.env.AMDL_WRAPPER_M3U8_PORT || 20020),
  account: Number(process.env.AMDL_WRAPPER_ACCOUNT_PORT || 30020),
}
const MUSIC_PATH = process.env.AMDL_MUSIC_PATH || '/music'

function probeTcp(host, port, timeout = 1500) {
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

function humanize(probe) {
  if (probe.ok) return probe
  if (probe.error === 'ENOTFOUND') {
    return { ...probe, error: 'wrapper container is not running' }
  }
  if (probe.error === 'ECONNREFUSED') {
    return { ...probe, error: 'wrapper is starting or has no credentials' }
  }
  return probe
}

healthRouter.get('/', async (_req, res) => {
  const [decrypt, m3u8, account, mp4box] = await Promise.all([
    probeTcp(WRAPPER_HOST, WRAPPER_PORTS.decrypt),
    probeTcp(WRAPPER_HOST, WRAPPER_PORTS.m3u8),
    probeTcp(WRAPPER_HOST, WRAPPER_PORTS.account),
    probeMp4Box(),
  ])
  let tokenOk = false
  let tokenError = null
  try {
    const t = await getBearerToken()
    tokenOk = Boolean(t)
  } catch (err) {
    tokenError = err.message
  }
  const musicWritable = await checkWritable(MUSIC_PATH)
  const wrapperUp = decrypt.ok && m3u8.ok && account.ok
  res.json({
    ok: wrapperUp && tokenOk && musicWritable.ok && mp4box.ok,
    wrapper: {
      host: WRAPPER_HOST,
      up: wrapperUp,
      decrypt: humanize(decrypt),
      m3u8: humanize(m3u8),
      account: humanize(account),
    },
    tools: { mp4box },
    appleToken: { ok: tokenOk, error: tokenError },
    music: { path: MUSIC_PATH, ...musicWritable },
  })
})

function checkWritable(p) {
  return new Promise((resolve) => {
    fs.access(p, fs.constants.W_OK, (err) => {
      if (err) resolve({ ok: false, error: err.code || err.message })
      else resolve({ ok: true })
    })
  })
}

function probeMp4Box(timeoutMs = 2500) {
  return new Promise((resolve) => {
    const child = spawn('MP4Box', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let out = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({ ok: false, error: 'timeout' })
    }, timeoutMs)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr.on('data', (d) => {
      out += d.toString()
    })

    child.on('error', (err) => {
      if (err?.code === 'ENOENT') {
        finish({ ok: false, error: 'MP4Box not found in PATH' })
      } else {
        finish({ ok: false, error: err.message || 'spawn failed' })
      }
    })

    child.on('close', (code) => {
      if (code === 0 && /GPAC version/i.test(out)) {
        finish({ ok: true })
      } else {
        finish({ ok: false, error: `exit ${code ?? 'unknown'}` })
      }
    })
  })
}
