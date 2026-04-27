import express from 'express'

import {
  enqueueAlbum,
  enqueuePlaylist,
  enqueueSong,
  cancelJob,
  getJob,
} from '../lib/queue.mjs'

export const downloadRouter = express.Router()

downloadRouter.post('/', async (req, res) => {
  try {
    const { albumId, storefront, quality } = req.body || {}
    if (!albumId) return res.status(400).json({ error: 'albumId required' })
    const job = await enqueueAlbum({ albumId, storefront, quality })
    res.status(202).json({ job })
  } catch (err) {
    if (err?.statusCode === 409 || err?.code === 'ALREADY_IN_LIBRARY') {
      return res.status(409).json({ error: err.message || 'Already in library' })
    }
    res.status(500).json({ error: err.message })
  }
})

downloadRouter.post('/song', async (req, res) => {
  try {
    const { songId, albumId, storefront } = req.body || {}
    if (!songId) return res.status(400).json({ error: 'songId required' })
    if (!albumId) return res.status(400).json({ error: 'albumId required' })
    const job = await enqueueSong({ songId, albumId, storefront })
    res.status(202).json({ job })
  } catch (err) {
    if (err?.statusCode === 409 || err?.code === 'ALREADY_IN_LIBRARY') {
      return res.status(409).json({ error: err.message || 'Already in library' })
    }
    res.status(500).json({ error: err.message })
  }
})

downloadRouter.post('/playlist', async (req, res) => {
  try {
    const { playlistId, storefront, quality } = req.body || {}
    if (!playlistId) return res.status(400).json({ error: 'playlistId required' })
    const job = await enqueuePlaylist({ playlistId, storefront, quality })
    res.status(202).json({ job })
  } catch (err) {
    if (err?.statusCode === 409 || err?.code === 'ALREADY_IN_LIBRARY') {
      return res.status(409).json({ error: err.message || 'Already in library' })
    }
    res.status(500).json({ error: err.message })
  }
})

downloadRouter.get('/:id', (req, res) => {
  const j = getJob(req.params.id)
  if (!j) return res.status(404).json({ error: 'job not found' })
  res.json({ job: j })
})

downloadRouter.delete('/:id', async (req, res) => {
  try {
    const r = await cancelJob(req.params.id)
    res.json(r)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
