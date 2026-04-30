import express from 'express'

import { readAppleCreds, readSettings } from '../lib/settingsStore.mjs'
import {
  fetchLibraryPage,
  getMyStorefront,
  iterateLibrary,
} from '../lib/appleLibraryApi.mjs'
import { enqueueAlbum, enqueuePlaylist, enqueueSong } from '../lib/queue.mjs'
import { emitEvent } from '../lib/eventBus.mjs'

export const cloudLibraryRouter = express.Router()

const KINDS = new Set(['albums', 'playlists', 'songs'])

let healthCache = { value: null, expiresAt: 0 }
const HEALTH_TTL_MS = 60_000

async function readCloudCreds() {
  const settings = await readSettings()
  const creds = await readAppleCreds()
  return {
    settings,
    mediaUserToken: creds.mediaUserToken || null,
  }
}

async function probeHealth() {
  const { mediaUserToken, settings } = await readCloudCreds()
  if (!mediaUserToken) {
    return { available: false, reason: 'no-media-user-token' }
  }
  try {
    const storefront = await getMyStorefront({
      mediaUserToken,
      language: settings.language,
    })
    return { available: true, storefront }
  } catch (err) {
    return {
      available: false,
      reason: err.code === 'MEDIA_USER_TOKEN_REJECTED' ? 'token-rejected' : 'probe-failed',
      error: err.message,
    }
  }
}

cloudLibraryRouter.get('/health', async (_req, res) => {
  try {
    const now = Date.now()
    if (healthCache.value && healthCache.expiresAt > now) {
      return res.json(healthCache.value)
    }
    const value = await probeHealth()
    healthCache = { value, expiresAt: now + HEALTH_TTL_MS }
    res.json(value)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function parsePaging(req) {
  const offset = Math.max(0, Number(req.query?.offset) || 0)
  const limitRaw = Number(req.query?.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, limitRaw) : 100
  return { offset, limit }
}

async function listKind(req, res, kind) {
  try {
    const { settings, mediaUserToken } = await readCloudCreds()
    if (!mediaUserToken) {
      return res.status(412).json({ error: 'media-user-token not configured' })
    }
    const { offset, limit } = parsePaging(req)
    const page = await fetchLibraryPage(kind, {
      mediaUserToken,
      language: settings.language,
      offset,
      limit,
    })
    res.json({
      items: page.items,
      next: page.next ? offset + page.items.length : null,
      total: page.total,
    })
  } catch (err) {
    if (err.code === 'NO_MEDIA_USER_TOKEN' || err.code === 'MEDIA_USER_TOKEN_REJECTED') {
      healthCache = { value: null, expiresAt: 0 }
      return res.status(err.statusCode || 412).json({ error: err.message })
    }
    res.status(500).json({ error: err.message })
  }
}

cloudLibraryRouter.get('/albums', (req, res) => listKind(req, res, 'albums'))
cloudLibraryRouter.get('/playlists', (req, res) => listKind(req, res, 'playlists'))
cloudLibraryRouter.get('/songs', (req, res) => listKind(req, res, 'songs'))

async function enqueueByKind(kind, item, { storefront, quality }) {
  if (kind === 'playlists') {
    if (item.catalogId) {
      const job = await enqueuePlaylist({
        playlistId: item.catalogId,
        storefront,
        quality,
      })
      return { job }
    }
    if (item.libraryId) {
      const job = await enqueuePlaylist({
        libraryId: item.libraryId,
        storefront,
        quality,
      })
      return { job }
    }
    return { skipped: 'no-catalog-id' }
  }
  if (!item.catalogId) {
    return { skipped: 'no-catalog-id' }
  }
  if (kind === 'albums') {
    const job = await enqueueAlbum({
      albumId: item.catalogId,
      storefront,
      quality,
    })
    return { job }
  }
  if (kind === 'songs') {
    const job = await enqueueSong({
      songId: item.catalogId,
      albumId: item.catalogAlbumId || null,
      storefront,
    })
    return { job }
  }
  return { skipped: 'unknown-kind' }
}

cloudLibraryRouter.post('/download-all', async (req, res) => {
  try {
    const kind = String(req.body?.kind || '')
    if (!KINDS.has(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${[...KINDS].join(', ')}` })
    }
    const { settings, mediaUserToken } = await readCloudCreds()
    if (!mediaUserToken) {
      return res.status(412).json({ error: 'media-user-token not configured' })
    }
    const storefront = settings.storefront
    const quality = settings.quality

    let scanned = 0
    let queued = 0
    let skippedExisting = 0
    let skippedQueued = 0
    let unsupported = 0
    const errors = []

    emitEvent('cloud-library.download-all.progress', {
      kind,
      scanned: 0,
      queued: 0,
      total: null,
      done: false,
    })

    for await (const item of iterateLibrary(kind, {
      mediaUserToken,
      language: settings.language,
    })) {
      scanned += 1
      const enqueueable =
        kind === 'playlists'
          ? item.catalogId || item.libraryId
          : item.catalogId && item.downloadable
      if (!enqueueable) {
        unsupported += 1
        continue
      }
      try {
        const result = await enqueueByKind(kind, item, { storefront, quality })
        if (result?.job) {
          if (result.job.status === 'queued' || result.job.status === 'running') {
            queued += 1
          } else {
            skippedQueued += 1
          }
        } else if (result?.skipped) {
          unsupported += 1
        }
      } catch (err) {
        if (err.code === 'ALREADY_IN_LIBRARY') {
          skippedExisting += 1
        } else {
          errors.push({ libraryId: item.libraryId, name: item.name, error: err.message })
        }
      }

      if (scanned % 5 === 0) {
        emitEvent('cloud-library.download-all.progress', {
          kind,
          scanned,
          queued,
          skippedExisting,
          unsupported,
          done: false,
        })
      }
    }

    emitEvent('cloud-library.download-all.progress', {
      kind,
      scanned,
      queued,
      skippedExisting,
      unsupported,
      done: true,
    })

    res.json({
      ok: true,
      kind,
      scanned,
      queued,
      skippedExisting,
      skippedQueued,
      unsupported,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
    })
  } catch (err) {
    if (err.code === 'NO_MEDIA_USER_TOKEN' || err.code === 'MEDIA_USER_TOKEN_REJECTED') {
      healthCache = { value: null, expiresAt: 0 }
      return res.status(err.statusCode || 412).json({ error: err.message })
    }
    res.status(500).json({ error: err.message })
  }
})
