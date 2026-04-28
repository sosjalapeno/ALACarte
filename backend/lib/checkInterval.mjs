const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const FIXED_INTERVAL_MS = {
  '1h': HOUR,
  '6h': 6 * HOUR,
  '12h': 12 * HOUR,
  daily: DAY,
  weekly: 7 * DAY,
}

export const FREQUENCY_VALUES = new Set([
  'auto',
  '1h',
  '6h',
  '12h',
  'daily',
  'weekly',
  'manual',
])

const DAILY_BUDGET = Math.max(50, Number(process.env.AMDL_FOLLOW_DAILY_BUDGET) || 300)
const MIN_AUTO_INTERVAL = Math.max(60_000, Number(process.env.AMDL_FOLLOW_MIN_INTERVAL_MS) || 30 * 60_000)
const MAX_AUTO_INTERVAL = Math.max(MIN_AUTO_INTERVAL, Number(process.env.AMDL_FOLLOW_MAX_INTERVAL_MS) || 7 * DAY)

export function autoIntervalMs(followedCount) {
  const n = Math.max(1, Number(followedCount) || 1)
  const raw = (n * DAY) / DAILY_BUDGET
  return Math.min(MAX_AUTO_INTERVAL, Math.max(MIN_AUTO_INTERVAL, raw))
}

export function resolveIntervalMs(frequency, followedCount) {
  if (frequency === 'manual') return Number.POSITIVE_INFINITY
  if (frequency === 'auto') return autoIntervalMs(followedCount)
  if (FIXED_INTERVAL_MS[frequency]) return FIXED_INTERVAL_MS[frequency]
  return DAY
}

export function describeInterval(ms) {
  if (!Number.isFinite(ms)) return 'manual only'
  if (ms < HOUR) return `${Math.round(ms / 60_000)} min`
  if (ms < DAY) {
    const h = ms / HOUR
    return h >= 2 ? `${h.toFixed(1).replace(/\.0$/, '')}h` : `${h.toFixed(1)}h`
  }
  const d = ms / DAY
  return d >= 2 ? `${Math.round(d)}d` : '1d'
}

export const AUTO_LIMITS = {
  DAILY_BUDGET,
  MIN_AUTO_INTERVAL,
  MAX_AUTO_INTERVAL,
}
