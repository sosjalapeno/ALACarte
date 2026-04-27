import express from 'express'

import { getPlaylist, normalizePlaylist } from '../lib/appleApi.mjs'
import { readSettings } from '../lib/settingsStore.mjs'

export const playlistRouter = express.Router()

playlistRouter.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id required' })
    const settings = await readSettings()
    const storefront = String(
      req.query.storefront || settings.storefront || 'us',
    )
    const language = settings.language || 'en-US'
    const raw = await getPlaylist({ storefront, id, language })
    const playlist = normalizePlaylist(raw?.data?.[0])
    if (!playlist) return res.status(404).json({ error: 'playlist not found' })
    res.json({ playlist, storefront })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})
