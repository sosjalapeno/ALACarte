import {
  getSessionVersion,
  isPasswordSet,
  onSessionVersionBumped,
} from './authStore.mjs'
import {
  buildSessionCookieName,
  buildSessionCookieOptions,
  getRequestSessionToken,
  issueToken,
  isSecureRequest,
  shouldRefresh,
  verifyToken,
} from './sessionToken.mjs'

const AUTH_DISABLED = String(process.env.AUTH_DISABLED || '').trim().toLowerCase() === 'true'
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const ABSOLUTE_SESSION_MAX_MS = 90 * 24 * 60 * 60 * 1000

let cachedSessionVersion = 1

onSessionVersionBumped((nextSv) => {
  if (Number.isInteger(nextSv) && nextSv > 0) {
    cachedSessionVersion = nextSv
  }
})

export function isAuthDisabled() {
  return AUTH_DISABLED
}

// Routes that must remain reachable without a valid session so the
// frontend can bootstrap (state probe, initial setup, login).
// defense-in-depth: requireAuth runs after authRouter, but if mount order
// ever changes, these still need to bypass the gate.
const ALWAYS_PUBLIC = new Set([
  '/api/auth/state',
  '/api/auth/setup',
  '/api/auth/login',
])

export function requireAuth() {
  return async (req, res, next) => {
    if (AUTH_DISABLED) return next()
    if (!req.path.startsWith('/api/')) return next()
    if (ALWAYS_PUBLIC.has(req.path)) return next()

    let passwordSet
    try {
      passwordSet = await isPasswordSet()
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
    if (!passwordSet) {
      return res.status(401).json({ error: 'auth not configured', needsSetup: true })
    }

    const token = getRequestSessionToken(req)
    const payload = verifyToken(token)
    if (!payload) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    // Trust the cached sv; only re-read disk when token looks stale or cache is at boot default.
    const tokenSv = payload.sv || 1
    if (tokenSv < cachedSessionVersion || cachedSessionVersion === 1) {
      const diskSv = await getSessionVersion()
      cachedSessionVersion = diskSv
      if (tokenSv < diskSv) {
        return res.status(401).json({ error: 'unauthorized' })
      }
    }

    const age = Date.now() - payload.iat
    if (shouldRefresh(payload, REFRESH_AFTER_MS) && age < ABSOLUTE_SESSION_MAX_MS) {
      const secure = isSecureRequest(req)
      const refreshed = issueToken({ user: payload.user, sv: payload.sv })
      res.cookie(
        buildSessionCookieName(secure),
        refreshed,
        buildSessionCookieOptions({ secure }),
      )
    }

    req.session = payload
    next()
  }
}
