import { emitEvent } from './eventBus.mjs'
import { loadArtistCatalog } from './artistCatalog.mjs'
import { hasAlbumInLibrary, scanLibraryOnce } from './libraryIndex.mjs'
import { enqueueAlbum } from './queue.mjs'
import { readSettings } from './settingsStore.mjs'
import { readFollowingStore, updateFollowedArtist } from './followedArtistsStore.mjs'

const FREQUENCY_MS = {
  '12h': 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

const SCHEDULER_TICK_MS = 5 * 60 * 1000

let timer = null
let running = false

export function startAutoDownloadScheduler() {
  if (timer) return
  timer = setInterval(() => {
    runAutoDownloadCheck({ reason: 'scheduled' }).catch((err) => {
      emitEvent('following.check', {
        phase: 'failed',
        message: err.message || 'Auto-download check failed',
      })
    })
  }, SCHEDULER_TICK_MS)
  runAutoDownloadCheck({ reason: 'startup' }).catch(() => {})
}

export async function runAutoDownloadCheck({ reason = 'manual', force = false } = {}) {
  if (running) return { ok: true, skipped: true, reason: 'already-running' }
  running = true
  try {
    const settings = await readSettings()
    if (!settings.autoDownloadsEnabled && !force) {
      emitEvent('following.check', {
        phase: 'skipped',
        reason,
        message: 'Auto-downloads are paused',
      })
      return { ok: true, skipped: true, reason: 'disabled' }
    }

    const intervalMs = FREQUENCY_MS[settings.autoDownloadCheckFrequency] || FREQUENCY_MS.daily
    const store = await readFollowingStore()
    const artists = Object.values(store.artists)
    const now = Date.now()
    const dueArtists = artists.filter(
      (artist) => force || !artist.lastCheckedAt || now - artist.lastCheckedAt >= intervalMs,
    )

    emitEvent('following.check', {
      phase: 'started',
      reason,
      artists: dueArtists.length,
      totalArtists: artists.length,
    })

    const libIndex = await scanLibraryOnce()

    let queued = 0
    let discovered = 0
    for (const artist of dueArtists) {
      const result = await checkFollowedArtist(artist, settings, libIndex)
      queued += result.queued
      discovered += result.discovered
    }

    emitEvent('following.check', {
      phase: 'completed',
      reason,
      artists: dueArtists.length,
      queued,
      discovered,
    })

    return { ok: true, artists: dueArtists.length, queued, discovered }
  } finally {
    running = false
  }
}

async function checkFollowedArtist(artist, settings, libIndex) {
  emitEvent('following.check', {
    phase: 'artist-started',
    artistId: artist.id,
    artistName: artist.name,
  })

  const catalog = await loadArtistCatalog({
    artistId: artist.id,
    storefront: artist.storefront || settings.storefront || 'us',
    language: settings.language || 'en-US',
    explicitFilter: settings.explicitFilter || 'explicit',
  })
  const albums = catalog?.albums || []
  const known = new Set(artist.knownReleaseIds || [])
  const newAlbums = albums.filter((album) => album.id && !known.has(album.id))
  const releaseDates = albums
    .map((album) => album.releaseDate)
    .filter(Boolean)
    .sort()
  const successfulIds = new Set(artist.knownReleaseIds || [])
  let queued = 0

  for (const album of newAlbums) {
    if (
      album.artistName &&
      album.name &&
      (await hasAlbumInLibrary(album.artistName, album.name, libIndex))
    ) {
      successfulIds.add(album.id)
      continue
    }

    try {
      const job = await enqueueAlbum({
        albumId: album.id,
        storefront: artist.storefront || settings.storefront || 'us',
      })
      queued += 1
      successfulIds.add(album.id)
      emitEvent('following.download', {
        artistId: artist.id,
        artistName: artist.name,
        albumId: album.id,
        albumTitle: album.name,
        jobId: job.id,
      })
    } catch (err) {
      if (err?.code === 'ALREADY_IN_LIBRARY') {
        successfulIds.add(album.id)
      } else {
        emitEvent('following.download', {
          artistId: artist.id,
          artistName: artist.name,
          albumId: album.id,
          albumTitle: album.name,
          error: err.message || 'Failed to queue auto-download',
        })
      }
    }
  }

  let missingCount = 0
  for (const album of albums) {
    if (!album.artistName || !album.name) continue
    if (!(await hasAlbumInLibrary(album.artistName, album.name, libIndex))) {
      missingCount++
    }
  }

  await updateFollowedArtist(artist.id, {
    name: catalog?.artist?.name || artist.name,
    genreNames: catalog?.artist?.genreNames || artist.genreNames,
    url: catalog?.artist?.url || artist.url,
    artworkTemplate:
      catalog?.artist?.artworkTemplate ||
      albums.find((album) => album.artworkTemplate)?.artworkTemplate ||
      artist.artworkTemplate ||
      null,
    artworkColor:
      catalog?.artist?.artworkColor ||
      albums.find((album) => album.artworkColor)?.artworkColor ||
      artist.artworkColor ||
      null,
    knownReleaseIds: Array.from(successfulIds),
    latestReleaseDate: releaseDates[releaseDates.length - 1] || artist.latestReleaseDate || null,
    lastCheckedAt: Date.now(),
    totalReleaseCount: albums.length,
    missingReleaseCount: missingCount,
  })

  emitEvent('following.check', {
    phase: 'artist-completed',
    artistId: artist.id,
    artistName: artist.name,
    discovered: newAlbums.length,
    queued,
  })

  return { discovered: newAlbums.length, queued }
}
