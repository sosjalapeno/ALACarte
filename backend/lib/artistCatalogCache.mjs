import { loadArtistCatalog as loadArtistCatalogRaw } from './artistCatalog.mjs'
import { AUTO_LIMITS, resolveIntervalMs } from './checkInterval.mjs'
import { readSettings } from './settingsStore.mjs'

const cache = new Map()
const inFlight = new Map()
const stats = { hits: 0, misses: 0, coalesced: 0, lastReset: Date.now() }

const HARD_TTL_CEILING = 6 * 60 * 60 * 1000
const HARD_TTL_FLOOR = 30 * 1000

function makeKey({ artistId, storefront, language, explicitFilter }) {
  return [
    String(storefront || 'us'),
    String(language || 'en-US'),
    String(explicitFilter || 'explicit'),
    String(artistId || ''),
  ].join('|')
}

async function currentTtlMs(followedCount) {
  try {
    const settings = await readSettings()
    const n = Number.isFinite(followedCount) ? followedCount : 1
    const interval = resolveIntervalMs(settings.autoDownloadCheckFrequency, n)
    if (!Number.isFinite(interval)) return HARD_TTL_CEILING
    return Math.min(HARD_TTL_CEILING, Math.max(HARD_TTL_FLOOR, interval))
  } catch {
    return AUTO_LIMITS.MIN_AUTO_INTERVAL
  }
}

export async function loadArtistCatalogCached(opts, { force = false, followedCount } = {}) {
  const key = makeKey(opts)
  const now = Date.now()
  if (!force) {
    const hit = cache.get(key)
    if (hit) {
      const ttl = hit.ttlMs ?? (await currentTtlMs())
      if (now - hit.fetchedAt < ttl) {
        stats.hits += 1
        return hit.catalog
      }
    }
  }
  const pending = inFlight.get(key)
  if (pending) {
    stats.coalesced += 1
    return pending
  }
  stats.misses += 1
  const ttlMs = await currentTtlMs(followedCount)
  const promise = loadArtistCatalogRaw(opts)
    .then((catalog) => {
      if (catalog) {
        cache.set(key, { catalog, fetchedAt: Date.now(), ttlMs })
      }
      return catalog
    })
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, promise)
  return promise
}

export function peekArtistCatalog(opts) {
  const key = makeKey(opts)
  const hit = cache.get(key)
  return hit?.catalog || null
}

export function peekAnyCachedCatalog(artistId) {
  if (!artistId) return null
  for (const [key, value] of cache.entries()) {
    if (key.endsWith(`|${artistId}`)) return value.catalog
  }
  return null
}

export function invalidateArtistCatalog(artistId) {
  if (!artistId) {
    cache.clear()
    return
  }
  for (const key of [...cache.keys()]) {
    if (key.endsWith(`|${artistId}`)) cache.delete(key)
  }
}

export function getArtistCatalogCacheStats() {
  return { ...stats, size: cache.size, inFlight: inFlight.size }
}
