import crypto from 'node:crypto'

import { getSessionHmacKey } from './secretKey.mjs'

export const SESSION_COOKIE_NAME = 'alacarte_session'
export const SESSION_COOKIE_HOST_PREFIX = '__Host-alacarte_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function b64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const std = str.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(std, 'base64')
}

function sign(payload) {
  return crypto.createHmac('sha256', getSessionHmacKey()).update(payload).digest()
}

export function issueToken(extra = {}) {
  const now = Date.now()
  const payload = {
    iat: now,
    exp: now + SESSION_TTL_MS,
    ...extra,
  }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = b64urlEncode(Buffer.from(payloadJson, 'utf8'))
  const sigB64 = b64urlEncode(sign(payloadB64))
  return `v1.${payloadB64}.${sigB64}`
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const payloadB64 = parts[1]
  const sigB64 = parts[2]
  let expected
  try {
    expected = sign(payloadB64)
  } catch {
    return null
  }
  let provided
  try {
    provided = b64urlDecode(sigB64)
  } catch {
    return null
  }
  if (provided.length !== expected.length) return null
  if (!crypto.timingSafeEqual(provided, expected)) return null
  let payload
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return null
  if (!Number.isInteger(payload.sv) || payload.sv < 1) return null
  if (Date.now() >= payload.exp) return null
  return payload
}

export function tokenAgeMs(payload) {
  if (!payload || typeof payload.iat !== 'number') return Number.POSITIVE_INFINITY
  return Date.now() - payload.iat
}

export function shouldRefresh(payload, refreshAfterMs) {
  return tokenAgeMs(payload) >= refreshAfterMs
}

export function buildSessionCookieName(secure = false) {
  return secure ? SESSION_COOKIE_HOST_PREFIX : SESSION_COOKIE_NAME
}

export function getRequestSessionToken(req) {
  return req.cookies?.[SESSION_COOKIE_HOST_PREFIX] || req.cookies?.[SESSION_COOKIE_NAME] || null
}

export function buildSessionCookieOptions({ secure = false } = {}) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  }
}

export function buildClearedCookieOptions({ secure = false } = {}) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  }
}

export function isSecureRequest(req) {
  if (req.protocol === 'https') return true
  if (req.secure) return true
  const proto = req.headers['x-forwarded-proto']
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') return true
  return false
}
