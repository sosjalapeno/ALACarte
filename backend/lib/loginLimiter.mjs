const SOFT_WINDOW_MS = 60_000
const HARD_WINDOW_MS = 15 * 60_000
const SOFT_FAIL_THRESHOLD = 5
const HARD_FAIL_THRESHOLD = 20
const HARD_LOCK_MS = 15 * 60_000
const MAX_SOFT_BACKOFF_MS = 30_000
const SWEEP_MS = 60_000
const IDLE_EVICT_MS = 30 * 60_000

const buckets = new Map()

function nowMs() {
  return Date.now()
}

function getBucket(key) {
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = {
      soft: [],
      hard: [],
      backoffUntil: 0,
      lockedUntil: 0,
      lastSeen: nowMs(),
    }
    buckets.set(key, bucket)
  }
  return bucket
}

function trim(bucket, now) {
  bucket.soft = bucket.soft.filter((t) => now - t <= SOFT_WINDOW_MS)
  bucket.hard = bucket.hard.filter((t) => now - t <= HARD_WINDOW_MS)
  bucket.lastSeen = now
}

function computeBackoffMs(softCount) {
  if (softCount < SOFT_FAIL_THRESHOLD) return 0
  const exponent = Math.max(0, softCount - SOFT_FAIL_THRESHOLD)
  return Math.min(MAX_SOFT_BACKOFF_MS, 1000 * 2 ** exponent)
}

function check(key) {
  const now = nowMs()
  const bucket = getBucket(key)
  trim(bucket, now)

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      status: 429,
      lockedUntil: bucket.lockedUntil,
      retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    }
  }

  if (bucket.backoffUntil > now) {
    return {
      allowed: false,
      status: 429,
      retryAfterSec: Math.max(1, Math.ceil((bucket.backoffUntil - now) / 1000)),
    }
  }

  return { allowed: true, status: 200 }
}

function recordFailure(key) {
  const now = nowMs()
  const bucket = getBucket(key)
  trim(bucket, now)

  bucket.soft.push(now)
  bucket.hard.push(now)

  if (bucket.hard.length >= HARD_FAIL_THRESHOLD) {
    bucket.lockedUntil = now + HARD_LOCK_MS
    return {
      status: 429,
      lockedUntil: bucket.lockedUntil,
      retryAfterSec: Math.max(1, Math.ceil(HARD_LOCK_MS / 1000)),
    }
  }

  const backoffMs = computeBackoffMs(bucket.soft.length)
  if (backoffMs > 0) {
    bucket.backoffUntil = now + backoffMs
    return {
      status: 429,
      retryAfterSec: Math.max(1, Math.ceil(backoffMs / 1000)),
    }
  }

  return { status: 401 }
}

function recordSuccess(key) {
  buckets.delete(key)
}

setInterval(() => {
  const now = nowMs()
  for (const [key, bucket] of buckets.entries()) {
    trim(bucket, now)
    if (
      bucket.soft.length === 0 &&
      bucket.hard.length === 0 &&
      bucket.backoffUntil <= now &&
      bucket.lockedUntil <= now &&
      now - bucket.lastSeen > IDLE_EVICT_MS
    ) {
      buckets.delete(key)
    }
  }
}, SWEEP_MS).unref()

export function buildLoginLimiter() {
  return {
    check,
    recordFailure,
    recordSuccess,
  }
}
