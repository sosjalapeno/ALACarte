import express from 'express'

import {
  followArtist,
  getFollowedArtist,
  listFollowedArtists,
  unfollowArtist,
  readFollowingStore,
  updateFollowedArtist,
} from '../lib/followedArtistsStore.mjs'
import { runAutoDownloadCheck } from '../lib/autoDownloads.mjs'
import { enqueueAlbum } from '../lib/queue.mjs'
import { scanLibraryOnce, hasAlbumInLibrary } from '../lib/libraryIndex.mjs'
import { loadArtistCatalog } from '../lib/artistCatalog.mjs'

export const followingRouter = express.Router()

followingRouter.get('/', async (_req, res) => {
  try {
    res.json({ artists: await listFollowedArtists() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

followingRouter.post('/check/run', async (_req, res) => {
  try {
    res.json(await runAutoDownloadCheck({ reason: 'manual', force: true }))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

followingRouter.post('/download-missing', async (_req, res) => {
  try {
    const store = await readFollowingStore()
    const libIndex = await scanLibraryOnce()
    let queuedCount = 0
    for (const artist of Object.values(store.artists)) {
      if (!artist.missingReleaseCount) continue
      
      const catalog = await loadArtistCatalog({
        artistId: artist.id,
        storefront: artist.storefront || 'us',
        language: 'en-US',
      })
      
      if (!catalog?.albums) continue
      
      for (const album of catalog.albums) {
        if (!album.artistName || !album.name) continue
        if (!(await hasAlbumInLibrary(album.artistName, album.name, libIndex))) {
          try {
            await enqueueAlbum({ 
              albumId: album.id, 
              storefront: artist.storefront,
              expectedArtistId: artist.id 
            })
            queuedCount++
          } catch {
          }
        }
      }
    }
    res.json({ ok: true, queued: queuedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

followingRouter.post('/:id/download-missing', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id required' })
    const store = await readFollowingStore()
    const artist = store.artists[id]
    if (!artist) return res.status(404).json({ error: 'artist not found' })

    const libIndex = await scanLibraryOnce()
    let queuedCount = 0
    if (artist.missingReleaseCount > 0) {
      const catalog = await loadArtistCatalog({
        artistId: id,
        storefront: artist.storefront || 'us',
        language: 'en-US',
      })

      if (catalog?.albums) {
        for (const album of catalog.albums) {
          if (!album.artistName || !album.name) continue
          if (!(await hasAlbumInLibrary(album.artistName, album.name, libIndex))) {
            try {
              await enqueueAlbum({ 
                albumId: album.id, 
                storefront: artist.storefront,
                expectedArtistId: artist.id 
              })
              queuedCount++
            } catch {
            }
          }
        }
      }
    }
    res.json({ ok: true, queued: queuedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

followingRouter.get('/:id', async (req, res) => {
  try {
    const artist = await getFollowedArtist(String(req.params.id || '').trim())
    res.json({ artist })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

followingRouter.post('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id required' })
    const downloadNow = Boolean(req.body?.downloadNow)
    const result = await followArtist({ artistId: id, downloadNow })
    const queued = []
    const failed = []
    if (downloadNow) {
      for (const album of result.albums) {
        try {
          const job = await enqueueAlbum({ albumId: album.id })
          queued.push(job)
        } catch (err) {
          if (err?.code !== 'ALREADY_IN_LIBRARY') {
            failed.push({
              albumId: album.id,
              albumTitle: album.name,
              error: err.message || 'Failed to queue album',
            })
          }
        }
      }
    }
    res.json({ artist: result.artist, queued, failed })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

followingRouter.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id required' })
    res.json(await unfollowArtist(id))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
