import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

import { withScryptSlot } from './scryptSemaphore.mjs'

const CONFIG_DIR = process.env.AMDL_CONFIG_DIR || '/config'
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json')

const SCRYPT_N = 131072
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64
const SALT_BYTES = 16
const SCRYPT_MAXMEM = 256 * 1024 * 1024

const scrypt = promisify(crypto.scrypt)

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 256
export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 32
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{2,32}$/

const sessionVersionListeners = new Set()

export function isValidUsername(name) {
  return typeof name === 'string' && USERNAME_PATTERN.test(name)
}

async function readFileSafe() {
  try {
    const raw = await fsp.readFile(AUTH_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!Number.isInteger(parsed.sv) || parsed.sv < 1) {
      parsed.sv = 1
    }
    return parsed
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throwStorageFailure(err)
  }
}

async function writeFileAtomic(payload) {
  const tmp = `${AUTH_FILE}.tmp`
  try {
    await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 })
    await fsp.rename(tmp, AUTH_FILE)
  } catch (err) {
    throwStorageFailure(err)
  }
}

function throwStorageFailure(err) {
  console.error('[auth] storage failure', err)
  const next = new Error('storage failure')
  next.code = 'STORAGE_FAILURE'
  throw next
}

function parseScryptEncoded(encoded) {
  if (typeof encoded !== 'string') return null
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return null
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  if (!salt.length || !expected.length) return null
  return { N, r, p, salt, expected }
}

function isHashStale(encoded) {
  if (typeof encoded !== 'string') return false
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  return (
    Number(parts[1]) !== SCRYPT_N ||
    Number(parts[2]) !== SCRYPT_R ||
    Number(parts[3]) !== SCRYPT_P
  )
}

function assertPassword(plain) {
  if (typeof plain !== 'string') {
    const err = new Error('password must be a string')
    err.code = 'WEAK_PASSWORD'
    throw err
  }
  if (plain.length < MIN_PASSWORD_LENGTH) {
    const err = new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    err.code = 'WEAK_PASSWORD'
    throw err
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    const err = new Error(`password must be no more than ${MAX_PASSWORD_LENGTH} characters`)
    err.code = 'LONG_PASSWORD'
    throw err
  }
}

export async function isPasswordSet() {
  const data = await readFileSafe()
  return Boolean(data?.passwordHash)
}

async function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_BYTES)
  const derived = await withScryptSlot(() =>
    scrypt(plain, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    }),
  )
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`
}

async function verifyHash(plain, encoded) {
  const parsed = parseScryptEncoded(encoded)
  if (!parsed) return false
  let derived
  try {
    derived = await withScryptSlot(() =>
      scrypt(plain, parsed.salt, parsed.expected.length, {
        N: parsed.N,
        r: parsed.r,
        p: parsed.p,
        maxmem: SCRYPT_MAXMEM,
      }),
    )
  } catch {
    return false
  }
  if (derived.length !== parsed.expected.length) return false
  return crypto.timingSafeEqual(derived, parsed.expected)
}

// Transparently re-hashes with current scrypt params if the stored hash is stale.
// Returns the new encoded hash on upgrade, null if params were already current.
export async function rehashIfStale(plain, currentEncoded) {
  if (!isHashStale(currentEncoded)) return null
  try {
    const newHash = await hashPassword(plain)
    const data = (await readFileSafe()) || {}
    // Guard: only persist if no concurrent password change already replaced the hash.
    if (data.passwordHash !== currentEncoded) return null
    data.passwordHash = newHash
    data.updatedAt = new Date().toISOString()
    await writeFileAtomic(data)
    console.log('[auth] transparently upgraded scrypt hash to current params')
    return newHash
  } catch (err) {
    console.error('[auth] rehash upgrade failed (non-fatal):', err.message)
    return null
  }
}

export async function getUsername() {
  const data = await readFileSafe()
  return data?.username ?? null
}

export async function setCredentials(username, plain) {
  if (typeof username !== 'string') {
    const err = new Error('username must be a string')
    err.code = 'INVALID_USERNAME'
    throw err
  }
  if (!isValidUsername(username)) {
    const err = new Error(
      `username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters (letters, digits, ., _, -)`,
    )
    err.code = 'INVALID_USERNAME'
    throw err
  }
  assertPassword(plain)
  const passwordHash = await hashPassword(plain)
  const data = (await readFileSafe()) || {}
  data.username = username
  data.passwordHash = passwordHash
  data.sv = Number.isInteger(data.sv) && data.sv > 0 ? data.sv : 1
  data.updatedAt = new Date().toISOString()
  if (!data.createdAt) data.createdAt = data.updatedAt
  await writeFileAtomic(data)
  return true
}

export async function setPassword(plain) {
  assertPassword(plain)
  const data = (await readFileSafe()) || {}
  const nextSv = Number.isInteger(data.sv) && data.sv > 0 ? data.sv + 1 : 2
  data.passwordHash = await hashPassword(plain)
  data.sv = nextSv
  data.updatedAt = new Date().toISOString()
  if (!data.createdAt) data.createdAt = data.updatedAt
  await writeFileAtomic(data)
  notifySessionVersionBumped(nextSv)
  return true
}

export async function setUsername(username) {
  if (typeof username !== 'string') {
    const err = new Error('username must be a string')
    err.code = 'INVALID_USERNAME'
    throw err
  }
  if (!isValidUsername(username)) {
    const err = new Error(
      `username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters (letters, digits, ., _, -)`,
    )
    err.code = 'INVALID_USERNAME'
    throw err
  }
  const data = (await readFileSafe()) || {}
  if (!data.passwordHash) {
    const err = new Error('credentials not yet configured')
    err.code = 'NOT_CONFIGURED'
    throw err
  }
  data.username = username
  data.updatedAt = new Date().toISOString()
  await writeFileAtomic(data)
  return true
}

export async function verifyPassword(plain) {
  const data = await readFileSafe()
  if (!data?.passwordHash) return false
  if (typeof plain !== 'string' || plain.length === 0) return false
  return verifyHash(plain, data.passwordHash)
}

// Returns the stored passwordHash on success (truthy) so callers can pass it
// to rehashIfStale() without an extra read. Returns null on failure.
export async function verifyCredentials(username, plain) {
  const data = await readFileSafe()
  if (!data?.passwordHash || !data?.username) return null
  if (typeof username !== 'string' || typeof plain !== 'string') return null
  // Always run scrypt so timing doesn't reveal which field was wrong.
  const pwOk = await verifyHash(plain, data.passwordHash)
  // Constant-time username compare on equal-length buffers.
  const a = Buffer.from(data.username, 'utf8')
  const b = Buffer.from(username, 'utf8')
  const userOk = a.length === b.length && crypto.timingSafeEqual(a, b)
  return userOk && pwOk ? data.passwordHash : null
}

export async function getSessionVersion() {
  const data = (await readFileSafe()) || {}
  return Number.isInteger(data.sv) && data.sv > 0 ? data.sv : 1
}

function notifySessionVersionBumped(nextSv) {
  for (const listener of sessionVersionListeners) {
    try {
      listener(nextSv)
    } catch {
      /* noop */
    }
  }
}

export function onSessionVersionBumped(listener) {
  if (typeof listener !== 'function') {
    return () => {}
  }
  sessionVersionListeners.add(listener)
  return () => {
    sessionVersionListeners.delete(listener)
  }
}

export async function bumpSessionVersion() {
  const data = (await readFileSafe()) || {}
  const nextSv = Number.isInteger(data.sv) && data.sv > 0 ? data.sv + 1 : 2
  data.sv = nextSv
  data.updatedAt = new Date().toISOString()
  if (!data.createdAt) data.createdAt = data.updatedAt
  await writeFileAtomic(data)
  notifySessionVersionBumped(nextSv)
  return nextSv
}

export async function clearPassword() {
  try {
    await fsp.unlink(AUTH_FILE)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

export function authFilePath() {
  return AUTH_FILE
}
