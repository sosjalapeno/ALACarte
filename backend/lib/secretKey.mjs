import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DEFAULT_CONFIG_DIR = process.env.AMDL_CONFIG_DIR || '/config'
const SESSION_HMAC_INFO = Buffer.from('alacarte/session-hmac/v1', 'utf8')

let rawKey = null
let sessionHmacKey = null

export function loadSecretsAtBoot(configDir = DEFAULT_CONFIG_DIR) {
  if (rawKey && sessionHmacKey) return
  const secretFile = path.join(configDir, '.secret')
  const hex = fs.readFileSync(secretFile, 'utf8').trim()
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`invalid secret key format in ${secretFile}`)
  }
  rawKey = Buffer.from(hex, 'hex')
  sessionHmacKey = crypto.hkdfSync(
    'sha256',
    rawKey,
    Buffer.alloc(0),
    SESSION_HMAC_INFO,
    32,
  )
}

export function getRawKey() {
  if (!rawKey) {
    throw new Error('secret key not initialized')
  }
  return rawKey
}

export function getSessionHmacKey() {
  if (!sessionHmacKey) {
    throw new Error('session HMAC key not initialized')
  }
  return sessionHmacKey
}
