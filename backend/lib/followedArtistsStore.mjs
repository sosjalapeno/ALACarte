import fsp from 'node:fs/promises'
import path from 'node:path'

import { loadArtistCatalog } from './artistCatalog.mjs'
import { hasAlbumInLibrary, scanLibraryOnce } from './libraryIndex.mjs'
import { readSettings } from './settingsStore.mjs'
import { onEvent as subscribeEvent, emitEvent } from './eventBus.mjs'

const CONFIG_DIR = process.env.AMDL_CONFIG_DIR || '/config'
const FOLLOWING_FILE = path.join(CONFIG_DIR, 'followed-artists.json')

const EMPTY_STORE = {
  version: 1,
  artists: {},
}

export async function readFollowingStore() {
  try {
    const raw = await fsp.readFile(FOLLOWING_FILE, 'utf8')
    return normalizeStore(JSON.parse(raw))
  } catch {
    return normalizeStore({})
  }
}

export async function writeFollowingStore(next) {
  const normalized = normalizeStore(next)
  await fsp.writeFile(FOLLOWING_FILE, JSON.stringify(normalized, null, 2), {
    mode: 0o600,
  })
  return normalized
}

export async function listFollowedArtists() {
  const store = await readFollowingStore()
  const artists = Object.values(store.artists).map(projectArtist)
  artists.sort((a, b) => a.name.localeCompare(b.name))
  return artists
}

export async function getFollowedArtist(id) {
  const store = await readFollowingStore()
  const artist = store.artists[id]
  return artist ? projectArtist(artist) : null
}

export async function followArtist({ artistId, downloadNow = false }) {
  const settings = await readSettings()
  const storefront = settings.storefront || 'us'
  const language = settings.language || 'en-US'
  const catalog = await loadArtistCatalog({
    artistId,
    storefront,
    language,
    explicitFilter: settings.explicitFilter || 'explicit',
  })
  if (!catalog?.artist) {
    const err = new Error('artist not found')
    err.statusCode = 404
    throw err
  }

  const now = Date.now()
  const store = await readFollowingStore()
  const previous = store.artists[artistId]
  const releaseIds = catalog.albums.map((album) => album.id).filter(Boolean)
  const knownReleaseIds = Array.from(
    new Set([...(previous?.knownReleaseIds || []), ...releaseIds]),
  )
  const releaseDates = catalog.albums
    .map((album) => album.releaseDate)
    .filter(Boolean)
    .sort()
  const latestReleaseDate =
    releaseDates[releaseDates.length - 1] || previous?.latestReleaseDate || null

  const libIndex = await scanLibraryOnce()
  let missingCount = 0
  for (const album of catalog.albums) {
    if (!album.artistName || !album.name) continue
    if (!(await hasAlbumInLibrary(album.artistName, album.name, libIndex))) {
      missingCount++
    }
  }

  store.artists[artistId] = normalizeArtistRecord({
    ...previous,
    id: artistId,
    name: catalog.artist.name || previous?.name || 'Unknown artist',
    genreNames: catalog.artist.genreNames || previous?.genreNames || [],
    url: catalog.artist.url || previous?.url || null,
    artworkTemplate:
      catalog.artist.artworkTemplate ||
      catalog.albums.find((album) => album.artworkTemplate)?.artworkTemplate ||
      previous?.artworkTemplate ||
      null,
    artworkColor:
      catalog.artist.artworkColor ||
      catalog.albums.find((album) => album.artworkColor)?.artworkColor ||
      previous?.artworkColor ||
      null,
    storefront,
    knownReleaseIds,
    latestReleaseDate,
    lastCheckedAt: now,
    followedAt: previous?.followedAt || now,
    updatedAt: now,
    totalReleaseCount: catalog.albums.length,
    missingReleaseCount: missingCount,
  })

  await writeFollowingStore(store)
  return {
    artist: projectArtist(store.artists[artistId]),
    albums: catalog.albums,
  }
}

export async function unfollowArtist(id) {
  const store = await readFollowingStore()
  const existed = Boolean(store.artists[id])
  delete store.artists[id]
  await writeFollowingStore(store)
  return { ok: true, existed }
}

export async function updateFollowedArtist(id, patch) {
  const store = await readFollowingStore()
  const current = store.artists[id]
  if (!current) return null
  store.artists[id] = normalizeArtistRecord({
    ...current,
    ...patch,
    updatedAt: Date.now(),
  })
  await writeFollowingStore(store)
  return store.artists[id]
}

function projectArtist(artist) {
  const total = artist.totalReleaseCount || 0
  const missing = artist.missingReleaseCount || 0
  return {
    ...artist,
    totalReleaseCount: total,
    missingReleaseCount: missing,
    fullyDownloaded: total > 0 && missing === 0,
  }
}

function normalizeStore(parsed) {
  const artists = {}
  for (const [id, artist] of Object.entries(parsed?.artists || {})) {
    const normalized = normalizeArtistRecord({ ...artist, id })
    if (normalized.id) artists[normalized.id] = normalized
  }
  return {
    ...EMPTY_STORE,
    ...parsed,
    version: 1,
    artists,
  }
}

function normalizeArtistRecord(artist) {
  const id = String(artist?.id || '').trim()
  return {
    id,
    name: String(artist?.name || 'Unknown artist'),
    genreNames: Array.isArray(artist?.genreNames) ? artist.genreNames.map(String) : [],
    url: artist?.url || null,
    artworkTemplate: artist?.artworkTemplate || null,
    artworkColor: artist?.artworkColor || null,
    storefront: String(artist?.storefront || 'us'),
    knownReleaseIds: Array.from(
      new Set((Array.isArray(artist?.knownReleaseIds) ? artist.knownReleaseIds : []).map(String)),
    ),
    latestReleaseDate: artist?.latestReleaseDate || null,
    lastCheckedAt: Number(artist?.lastCheckedAt || 0),
    followedAt: Number(artist?.followedAt || Date.now()),
    updatedAt: Number(artist?.updatedAt || Date.now()),
    totalReleaseCount: Number(artist?.totalReleaseCount || 0),
    missingReleaseCount: Number(artist?.missingReleaseCount || 0),
  }
}

subscribeEvent(async (evt) => {
  if (!evt || evt.type !== 'job.update') return
  const job = evt.data
  if (!job || job.status !== 'done' || job.kind !== 'album' || !job.artistId) return
  try {
    const store = await readFollowingStore()
    const artist = store.artists[job.artistId]
    if (artist && artist.missingReleaseCount > 0) {
      const newCount = Math.max(0, artist.missingReleaseCount - 1)
      await updateFollowedArtist(job.artistId, { missingReleaseCount: newCount })
      emitEvent('following.updated', { artistId: job.artistId, missingReleaseCount: newCount })
    }
  } catch (err) {
    console.error('Failed to decrement missingReleaseCount for job', job.id, err)
  }
})
