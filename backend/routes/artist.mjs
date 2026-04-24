import express from 'express'

import { getArtist } from '../lib/appleApi.mjs'
import { readSettings } from '../lib/settingsStore.mjs'
import { filterAlbumsByRating } from '../lib/contentRatingFilter.mjs'

export const artistRouter = express.Router()

artistRouter.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim()
    if (!id) return res.status(400).json({ error: 'id required' })
    const settings = await readSettings()
    const storefront = String(
      req.query.storefront || settings.storefront || 'us',
    )
    const language = settings.language || 'en-US'
    const raw = await getArtist({ storefront, id, language })
    const a = raw?.data?.[0]
    if (!a) return res.status(404).json({ error: 'artist not found' })
    const albums = (a.relationships?.albums?.data || []).map((x) => ({
      id: x.id,
      type: x.type,
      name: x.attributes?.name,
      artistId: a.id,
      artistName: x.attributes?.artistName || a.attributes?.name,
      releaseDate: x.attributes?.releaseDate,
      year: x.attributes?.releaseDate
        ? String(x.attributes.releaseDate).slice(0, 4)
        : null,
      trackCount: x.attributes?.trackCount,
      artworkTemplate: x.attributes?.artwork?.url || null,
      artworkColor: x.attributes?.artwork?.bgColor || null,
      isSingle: x.attributes?.isSingle,
      contentRating: x.attributes?.contentRating,
    }))
    const filteredAlbums = filterAlbumsByRating(
      albums,
      settings.explicitFilter || 'explicit',
    )
    res.json({
      artist: {
        id: a.id,
        name: a.attributes?.name,
        genreNames: a.attributes?.genreNames || [],
        url: a.attributes?.url,
      },
      albums: filteredAlbums,
      storefront,
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})
