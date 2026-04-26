import crypto from 'node:crypto'

let setupToken = null

export function generateSetupToken() {
  setupToken = crypto.randomBytes(32).toString('hex')
  return setupToken
}

export function requiresSetupToken() {
  return Boolean(setupToken)
}

export function verifyAndConsumeSetupToken(candidate) {
  if (!setupToken) return true
  if (typeof candidate !== 'string') return false
  const a = Buffer.from(candidate.trim())
  const b = Buffer.from(setupToken)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (ok) {
    setupToken = null
  }
  return ok
}

export function clearSetupToken() {
  setupToken = null
}
