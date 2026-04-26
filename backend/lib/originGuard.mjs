import { isAuthDisabled } from './requireAuth.mjs'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function parseSource(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

export function originGuard() {
  return (req, res, next) => {
    if (isAuthDisabled()) return next()
    if (!req.path.startsWith('/api/')) return next()
    if (SAFE_METHODS.has(req.method)) return next()

    const expected = `${req.protocol}://${req.headers.host}`
    const origin = parseSource(req.headers.origin)
    if (origin && origin === expected) return next()

    const referer = parseSource(req.headers.referer)
    if (referer && referer === expected) return next()

    return res.status(403).json({ error: 'forbidden origin' })
  }
}
