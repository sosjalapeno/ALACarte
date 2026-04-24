import Docker from 'dockerode'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { emitEvent } from './eventBus.mjs'

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const WRAPPER_IMAGE = 'alacarte-wrapper:local'
const WRAPPER_CONTAINER = 'alacarte-wrapper'
const TEMP_CONTAINER = 'alacarte-wrapper-login'
const DEFAULT_NETWORK = 'alacarte-net'
const WRAPPER_DATA_IN_WEB = '/wrapper-data'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function validateEmail(e) {
  if (typeof e !== 'string' || e.length < 3 || e.length > 320) return false
  return EMAIL_RE.test(e)
}
function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 1 || p.length > 512) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(p)) return false
  return true
}
function validate2faCode(c) {
  return typeof c === 'string' && /^\d{4,8}$/.test(c.trim())
}

async function safeRemoveContainer(name) {
  try {
    const c = docker.getContainer(name)
    try {
      await c.stop({ t: 3 })
    } catch {
      /* ignore */
    }
    try {
      await c.remove({ force: true })
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

// Inspect the existing compose-managed wrapper container and snapshot everything
// we need to later recreate an equivalent one: the data bind mount, the network,
// and the compose labels. Callers MUST invoke this BEFORE removing the wrapper,
// otherwise the data would default to bogus values that don't match the host.
async function captureWrapperSpec() {
  try {
    const c = docker.getContainer(WRAPPER_CONTAINER)
    const info = await c.inspect()
    const dataMount = (info.Mounts || []).find(
      (x) => x.Destination === '/app/rootfs/data',
    )
    const bind = dataMount?.Source
      ? `${dataMount.Source}:/app/rootfs/data`
      : null
    const networks = Object.keys(info.NetworkSettings?.Networks || {})
    const network = networks[0] || null
    const labels = info.Config?.Labels || null
    return { bind, network, labels }
  } catch {
    return { bind: null, network: null, labels: null }
  }
}

function resolveWrapperNetwork(spec) {
  return spec?.network || process.env.AMDL_WRAPPER_NETWORK || DEFAULT_NETWORK
}

function requireWrapperBind(spec) {
  if (spec?.bind) return spec.bind
  throw new Error(
    'cannot locate wrapper data volume — start the stack with `docker compose up -d` at least once so the wrapper container is created before attempting login',
  )
}

function shellQuote(s) {
  return `'${String(s).replaceAll("'", `'\\''`)}'`
}

let active = null

let hardBlockReason = null

function resetActive() {
  active = null
}

export function clearHardBlock() {
  hardBlockReason = null
}

export function getHardBlock() {
  return hardBlockReason
}

function emitStatus(patch) {
  if (!active) return
  active.status = { ...active.status, ...patch, ts: Date.now() }
  emitEvent('wrapper.login', active.status)
}

const WRAPPER_2FA_PATH =
  '/app/rootfs/data/data/com.apple.android.music/files/2fa.txt'

async function clearStale2faFile() {
  const candidates = [
    path.join(
      WRAPPER_DATA_IN_WEB,
      'data',
      'com.apple.android.music',
      'files',
      '2fa.txt',
    ),
    path.join(WRAPPER_DATA_IN_WEB, '2fa.txt'),
  ]
  for (const p of candidates) {
    try {
      await fsp.unlink(p)
    } catch {
      /* ignore */
    }
  }
}

async function writeCodeIntoContainer(container, code) {
  const safe = String(code).replace(/\D/g, '').slice(0, 8)
  if (!safe) throw new Error('empty 2FA code')
  const exec = await container.exec({
    Cmd: [
      'sh',
      '-c',
      'printf %s "$1" > "$2" && ls -la "$2" 1>&2',
      'sh',
      safe,
      WRAPPER_2FA_PATH,
    ],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  })
  const stream = await exec.start({})
  const chunks = []
  await new Promise((resolve) => {
    stream.on('data', (c) => chunks.push(c))
    stream.on('end', resolve)
    stream.on('close', resolve)
  })
  const info = await exec.inspect()
  const output = Buffer.concat(chunks).toString('utf8')
  console.error(
    `[wrapper-login] 2FA file-drop exit=${info.ExitCode} output=${output.slice(0, 500)}`)
  if (info.ExitCode !== 0) {
    throw new Error(
      `Failed to write 2FA file inside wrapper container (exit ${info.ExitCode})`,
    )
  }
}

function parseMultiplexedChunk(buf) {
  const out = []
  while (buf.length > 8) {
    const len = buf.readUInt32BE(4)
    if (buf.length < 8 + len) break
    const body = buf.subarray(8, 8 + len).toString('utf8')
    buf = buf.subarray(8 + len)
    out.push(body)
  }
  return out.join('')
}

export function getLoginStatus() {
  if (!active) return { inProgress: false }
  return {
    inProgress: true,
    status: active.status,
  }
}

export async function isDockerReachable() {
  try {
    await docker.ping()
    return true
  } catch {
    return false
  }
}

export function startWrapperLogin({ email, password }) {
  if (active) {
    return Promise.reject(new Error('A sign-in is already in progress'))
  }
  if (hardBlockReason) {
    return Promise.reject(
      new Error(
        `${hardBlockReason} Retrying now will only deepen the lockout. Reset the password at iforgot.apple.com, sign in once on a real Apple device, then clear and re-enter credentials here.`,
      ),
    )
  }
  if (!validateEmail(email)) {
    return Promise.reject(new Error('Invalid email format'))
  }
  if (!validatePassword(password)) {
    return Promise.reject(new Error('Invalid password'))
  }

  active = {
    email,
    password,
    collected: '',
    twoFaDetected: false,
    twoFaSubmitted: false,
    status: { phase: 'preparing' },
    promise: null,
    resolve: null,
    reject: null,
    container: null,
    terminated: false,
  }

  const promise = new Promise((resolve, reject) => {
    active.resolve = resolve
    active.reject = reject
  })
  active.promise = promise

  runLoginFlow().catch((err) => {
    try {
      finalizeFailure(err.message || String(err))
    } catch {}
  })

  return promise
}

async function runLoginFlow() {
  emitStatus({ phase: 'preparing' })
  await safeRemoveContainer(TEMP_CONTAINER)
  const spec = await captureWrapperSpec()
  active.wrapperSpec = spec
  const bind = requireWrapperBind(spec)
  const network = resolveWrapperNetwork(spec)
  await safeRemoveContainer(WRAPPER_CONTAINER)
  await clearStale2faFile()

  const loginArg = `${active.email}:${active.password}`

  emitStatus({ phase: 'creating' })
  const container = await docker.createContainer({
    name: TEMP_CONTAINER,
    Image: WRAPPER_IMAGE,
    Entrypoint: ['/app/wrapper'],
    Cmd: ['-L', loginArg, '-F', '-H', '0.0.0.0'],
    ExposedPorts: {
      '10020/tcp': {},
      '20020/tcp': {},
      '30020/tcp': {},
    },
    HostConfig: {
      Binds: [bind],
      NetworkMode: network,
      AutoRemove: false,
      RestartPolicy: { Name: 'no' },
    },
    NetworkingConfig: {
      EndpointsConfig: { [network]: {} },
    },
  })
  active.container = container

  const logStream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  })
  logStream.on('data', (chunk) => {
    if (!active) return
    const text = parseMultiplexedChunk(chunk)
    const redacted = text
      .replaceAll(active.email, '[redacted-email]')
      .replaceAll(active.password, '[redacted-password]')
    active.collected += redacted
    emitEvent('wrapper.login.log', { line: redacted.trim().slice(0, 500) })
    checkCollected()
  })
  logStream.on('end', () => maybeCompleteByLogs())
  logStream.on('close', () => maybeCompleteByLogs())

  await container.start()
  emitStatus({ phase: 'signing-in' })

  active.overallTimeout = setTimeout(() => {
    if (active && !active.terminated) {
      finalizeFailure('Sign-in timed out')
    }
  }, 180_000)
}

function checkCollected() {
  if (!active) return
  const s = active.collected

  if (
    !active.twoFaDetected &&
    /\[!\] Enter your 2FA code into rootfs/i.test(s)
  ) {
    active.twoFaDetected = true
    emitStatus({ phase: '2fa-required' })
  }

  if (/account info cached successfully/i.test(s)) {
    finalizeSuccess().catch((e) => finalizeFailure(e.message))
    return
  }
}

function maybeCompleteByLogs() {
  if (!active || active.terminated) return
  if (!/account info cached successfully/i.test(active.collected)) {
    const reason = extractWrapperFailureReason(active.collected)
    if (reason && /disabled|locked/i.test(reason)) {
      hardBlockReason = reason
    }
    finalizeFailure(
      reason ||
        (active.twoFaDetected
          ? 'Sign-in ended without success after 2FA'
          : 'Sign-in container exited unexpectedly'),
    )
  }
}

function extractWrapperFailureReason(s) {
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const DIALOG_RE =
    /^\[\.\]\s*dialogHandler:\s*\{title:\s*(.*?),\s*message:\s*(.*?)\}$/i
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(DIALOG_RE)
    if (!m) continue
    const title = m[1].trim()
    const message = m[2].trim()
    if (!title || /^sign in$/i.test(title)) continue
    if (/disabled/i.test(title)) {
      return `Your Apple Account is disabled. ${message || 'Reset it at iforgot.apple.com, then try again.'}`
    }
    if (/account information/i.test(title)) {
      return 'Apple rejected the email or password. Double-check both and try again.'
    }
    if (/locked/i.test(title)) {
      return `Apple Account locked. ${message || 'Reset it at iforgot.apple.com before retrying.'}`
    }
    if (/billing|payment/i.test(title)) {
      return `Apple Music sign-in needs attention: ${title}. ${message}`
    }
    const joined = [title, message].filter(Boolean).join(' — ')
    if (joined) return joined.slice(0, 240)
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    if (/\[!\] Failed to get 2FA Code/i.test(lines[i])) {
      return '2FA code wasn’t entered in time. Try again.'
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (/\[\.\] response type/i.test(l)) {
      return `Wrapper reported: ${l}`
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (!/^__bionic_|^\[\+\] initializing|^\[\+\] starting/i.test(l)) {
      return `Sign-in failed: ${l.slice(0, 180)}`
    }
  }
  return null
}

async function finalizeSuccess() {
  if (!active || active.terminated) return
  active.terminated = true
  clearTimeout(active.overallTimeout)
  emitStatus({ phase: 'starting-main' })
  try {
    try {
      await active.container.stop({ t: 2 })
    } catch {}
    await safeRemoveContainer(TEMP_CONTAINER)
    await clearStale2faFile()
    await startMainWrapper()
    emitStatus({ phase: 'ready' })
    const resolve = active.resolve
    resetActive()
    resolve({ ok: true })
  } catch (err) {
    const reject = active?.reject
    resetActive()
    reject?.(err)
  }
}

async function finalizeFailure(reason) {
  if (!active || active.terminated) return
  active.terminated = true
  clearTimeout(active.overallTimeout)
  const tail = (active.collected || '').slice(-1800)
  console.error(
    `[wrapper-login] failed: ${reason}\n--- wrapper output (tail, redacted) ---\n${tail}`,
  )
  emitStatus({ phase: 'failed', error: reason })
  try {
    if (active.container) {
      try {
        await active.container.stop({ t: 2 })
      } catch {}
    }
  } finally {
    await safeRemoveContainer(TEMP_CONTAINER).catch(() => {})
    await clearStale2faFile().catch(() => {})
    const reject = active.reject
    resetActive()
    reject?.(new Error(reason))
  }
}

export async function submit2FA(code) {
  if (!active) throw new Error('No sign-in in progress')
  if (!active.twoFaDetected) {
    throw new Error('No 2FA prompt has been seen for this sign-in')
  }
  if (active.twoFaSubmitted) {
    throw new Error('2FA code already submitted for this sign-in')
  }
  if (!validate2faCode(code)) {
    throw new Error('Code must be 4-8 digits')
  }
  if (!active.container) throw new Error('Login container not available')
  active.twoFaSubmitted = true
  await writeCodeIntoContainer(active.container, code.trim())
  emitStatus({ phase: 'verifying-2fa' })
  return { ok: true }
}

export async function cancelLogin() {
  if (!active) return { ok: true, noop: true }
  await finalizeFailure('Cancelled')
  return { ok: true }
}

async function startMainWrapper() {
  const spec = active?.wrapperSpec || (await captureWrapperSpec())
  const bind = requireWrapperBind(spec)
  const network = resolveWrapperNetwork(spec)
  const labels = spec.labels || { 'com.docker.compose.service': 'wrapper' }
  await safeRemoveContainer(WRAPPER_CONTAINER)
  const container = await docker.createContainer({
    name: WRAPPER_CONTAINER,
    Image: WRAPPER_IMAGE,
    Entrypoint: ['/app/wrapper'],
    Cmd: ['-H', '0.0.0.0'],
    ExposedPorts: {
      '10020/tcp': {},
      '20020/tcp': {},
      '30020/tcp': {},
    },
    HostConfig: {
      Binds: [bind],
      NetworkMode: network,
      RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 },
    },
    NetworkingConfig: {
      EndpointsConfig: { [network]: {} },
    },
    Labels: labels,
  })
  await container.start()
}

export function wrapperDataMountExists() {
  try {
    return fs.statSync(WRAPPER_DATA_IN_WEB).isDirectory()
  } catch {
    return false
  }
}
