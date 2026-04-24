import express from 'express'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { searchCatalog } from '../lib/appleApi.mjs'
import { makeAlbumKey, makeSongKey, scanLibrary, stripTrailingYear } from '../lib/libraryIndex.mjs'
import { readSettings } from '../lib/settingsStore.mjs'

export const libraryRouter = express.Router()

const MUSIC_ROOT = process.env.AMDL_MUSIC_PATH || '/music'
const AUDIO_RE = /\.(flac|m4a|mp3)$/i
const ARTIST_RESOLVE_TTL_MS = 24 * 60 * 60 * 1000
const artistResolveCache = new Map()

libraryRouter.get('/', async (_req, res) => {
  try {
    const index = await scanLibrary()
    const settings = await readSettings()
    const storefront = settings?.storefront || 'us'
    const language = settings?.language || 'en-US'
    const artistIdsByName = await resolveArtistIdsByName(
      index,
      storefront,
      language,
    )

    const singles = index.singles.map((s) => ({
      ...s,
      artistId: artistIdsByName.get(normalizeArtistName(s.artistName)) || null,
    }))
    const albums = index.albums.map((a) => ({
      ...a,
      artistId: artistIdsByName.get(normalizeArtistName(a.artistName)) || null,
    }))

    res.json({
      albums,
      singles,
      totals: {
        albums: albums.length,
        singles: singles.length,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

libraryRouter.post('/presence', async (req, res) => {
  try {
    const albumChecks = Array.isArray(req.body?.albums) ? req.body.albums : []
    const songChecks = Array.isArray(req.body?.songs) ? req.body.songs : []
    const index = await scanLibrary()

    const albums = {}
    for (const item of albumChecks) {
      const id = String(item?.id || '')
      if (!id) continue
      const artistName = String(item?.artistName || '')
      const albumName = stripTrailingYear(String(item?.albumName || ''))
      const key = makeAlbumKey(artistName, albumName)
      albums[id] = index.albumKeys.has(key)
    }

    const songs = {}
    for (const item of songChecks) {
      const id = String(item?.id || '')
      if (!id) continue
      const artistName = String(item?.artistName || '')
      const songName = String(item?.songName || '')
      songs[id] = index.songKeys.has(makeSongKey(artistName, songName))
    }

    res.json({ albums, songs })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

libraryRouter.delete('/song', async (req, res) => {
  try {
    const relPath = String(req.body?.relPath || '')
    const parts = relParts(relPath)
    if (parts.length !== 3 || parts[1].toLowerCase() !== 'singles') {
      return res.status(400).json({ error: 'invalid song path' })
    }
    if (parts.some((p) => p.startsWith('.'))) {
      return res.status(400).json({ error: 'invalid song path' })
    }
    if (!AUDIO_RE.test(parts[2])) {
      return res.status(400).json({ error: 'audio file required' })
    }

    const abs = resolveUnderMusicRoot(relPath)
    const stat = await fsp.stat(abs).catch(() => null)
    if (!stat || !stat.isFile()) {
      return res.status(404).json({ error: 'song not found' })
    }

    await fsp.unlink(abs)
    const lrcPath = path.join(
      path.dirname(abs),
      `${path.basename(abs, path.extname(abs))}.lrc`,
    )
    const removedLyrics = await fsp.unlink(lrcPath).then(() => true).catch(() => false)

    return res.json({ ok: true, removedLyrics })
  } catch (err) {
    if (err.message === 'out of music root') {
      return res.status(400).json({ error: 'invalid path' })
    }
    return res.status(500).json({ error: err.message })
  }
})

libraryRouter.delete('/album', async (req, res) => {
  try {
    const relPath = String(req.body?.relPath || '')
    const parts = relParts(relPath)
    if (parts.length !== 2) {
      return res.status(400).json({ error: 'invalid album path' })
    }
    if (parts.some((p) => p.startsWith('.'))) {
      return res.status(400).json({ error: 'invalid album path' })
    }
    if (parts[1].toLowerCase() === 'singles') {
      return res.status(400).json({ error: 'use song delete for singles' })
    }

    const abs = resolveUnderMusicRoot(relPath)
    const stat = await fsp.stat(abs).catch(() => null)
    if (!stat || !stat.isDirectory()) {
      return res.status(404).json({ error: 'album not found' })
    }

    await fsp.rm(abs, { recursive: true, force: true })
    return res.json({ ok: true })
  } catch (err) {
    if (err.message === 'out of music root') {
      return res.status(400).json({ error: 'invalid path' })
    }
    return res.status(500).json({ error: err.message })
  }
})

function relParts(relPath) {
  return String(relPath || '')
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function resolveUnderMusicRoot(relPath) {
  const root = path.resolve(MUSIC_ROOT)
  const abs = path.resolve(root, relPath)
  if (!(abs === root || abs.startsWith(`${root}${path.sep}`))) {
    throw new Error('out of music root')
  }
  return abs
}

async function resolveArtistIdsByName(index, storefront, language) {
  const byName = new Map()
  const names = new Set([
    ...index.albums.map((a) => a.artistName),
    ...index.singles.map((s) => s.artistName),
  ])
  await Promise.all(
    [...names]
      .map((name) => String(name || '').trim())
      .filter(Boolean)
      .map(async (name) => {
        const key = normalizeArtistName(name)
        if (!key) return
        const id = await resolveArtistId(name, storefront, language)
        byName.set(key, id)
      }),
  )
  return byName
}

async function resolveArtistId(artistName, storefront, language) {
  const normalized = normalizeArtistName(artistName)
  if (!normalized) return null
  const cacheKey = `${storefront}::${normalized}`
  const now = Date.now()
  const cached = artistResolveCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.artistId

  let artistId = null
  try {
    const raw = await searchCatalog({
      storefront,
      term: artistName,
      types: 'artists',
      limit: 10,
      offset: 0,
      language,
    })
    const candidates = raw?.results?.artists?.data || []
    artistId = pickBestArtistId(artistName, candidates)
  } catch {
    artistId = null
  }

  artistResolveCache.set(cacheKey, {
    artistId,
    expiresAt: now + ARTIST_RESOLVE_TTL_MS,
  })
  return artistId
}

function pickBestArtistId(targetName, candidates) {
  const targetNorm = normalizeArtistName(targetName)
  const targetLower = String(targetName || '').toLowerCase().trim()
  const targetTokens = tokenizeArtistName(targetName)
  if (!targetNorm) return null

  const scored = candidates
    .map((c) => {
      const name = String(c?.attributes?.name || '').trim()
      const id = String(c?.id || '').trim()
      if (!name || !id) return null

      const norm = normalizeArtistName(name)
      const lower = name.toLowerCase()
      const tokens = tokenizeArtistName(name)
      let score = 0

      if (norm === targetNorm) score += 100
      if (lower === targetLower) score += 20
      if (norm.startsWith(targetNorm) || targetNorm.startsWith(norm)) score += 25
      if (lower.includes(targetLower) || targetLower.includes(lower)) score += 12

      if (targetTokens.length > 0) {
        const overlap = tokenOverlap(targetTokens, tokens)
        score += overlap * 35
      }

      return { id, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  const best = scored[0]
  const second = scored[1]
  if (best.score < 80) return null
  if (second && best.score - second.score < 10) return null
  return best.id
}

function normalizeArtistName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenizeArtistName(value) {
  return normalizeArtistName(value)
    .split(' ')
    .filter((t) => t.length > 1)
}

function tokenOverlap(a, b) {
  if (a.length === 0) return 0
  const setB = new Set(b)
  let common = 0
  for (const token of a) {
    if (setB.has(token)) common++
  }
  return common / a.length
}
