import express from 'express'

import { searchCatalog } from '../lib/appleApi.mjs'
import { readSettings } from '../lib/settingsStore.mjs'
import { filterAlbumsByRating } from '../lib/contentRatingFilter.mjs'

export const searchRouter = express.Router()

searchRouter.get('/', async (req, res) => {
  try {
    const term = String(req.query.q || '').trim()
    if (!term) return res.json({ albums: [], artists: [], songs: [], playlists: [] })
    const types = String(req.query.types || 'albums,artists,songs,playlists')
    const limit = Math.min(Number(req.query.limit || 25), 50)
    const offset = Math.max(Number(req.query.offset || 0), 0)
    const settings = await readSettings()
    const storefront = String(req.query.storefront || settings.storefront || 'us')
    const language = settings.language || 'en-US'
    const data = await searchCatalog({
      storefront,
      term,
      types,
      limit,
      offset,
      language,
    })
    const r = data?.results || {}
    const artists = (r.artists?.data || []).map((x) => ({
      id: x.id,
      type: x.type,
      name: x.attributes?.name,
      genreNames: x.attributes?.genreNames || [],
      url: x.attributes?.url,
    }))

    const resolveArtistId = (relId, artistName) => {
      if (relId) return relId
      const match = artists.find((a) => a.name === artistName)
      return match ? match.id : null
    }

    const albums = (r.albums?.data || []).map((x) => {
      const relArtistId = x.relationships?.artists?.data?.[0]?.id || null
      return {
        id: x.id,
        type: x.type,
        name: x.attributes?.name,
        artistName: x.attributes?.artistName,
        artistId: resolveArtistId(relArtistId, x.attributes?.artistName),
        releaseDate: x.attributes?.releaseDate,
        year: x.attributes?.releaseDate
          ? String(x.attributes.releaseDate).slice(0, 4)
          : null,
        trackCount: x.attributes?.trackCount,
        isSingle: x.attributes?.isSingle,
        contentRating: x.attributes?.contentRating,
        artworkTemplate: x.attributes?.artwork?.url || null,
        artworkColor: x.attributes?.artwork?.bgColor || null,
        url: x.attributes?.url,
      }
    })
    const songs = (r.songs?.data || []).map((x) => {
      const songUrl = x.attributes?.url || ''
      const relArtistId = x.relationships?.artists?.data?.[0]?.id || null
      // Apple song URLs look like
      // https://music.apple.com/<sf>/album/<slug>/<albumId>?i=<songId>
      const m = songUrl.match(
        /\/album\/(?:[^/]+\/)?(\d+)(?:\?|$)/,
      )
      const albumId = m ? m[1] : null
      return {
        id: x.id,
        type: x.type,
        name: x.attributes?.name,
        artistName: x.attributes?.artistName,
        artistId: resolveArtistId(relArtistId, x.attributes?.artistName),
        albumName: x.attributes?.albumName,
        albumId,
        durationMs: x.attributes?.durationInMillis,
        artworkTemplate: x.attributes?.artwork?.url || null,
        artworkColor: x.attributes?.artwork?.bgColor || null,
        url: songUrl,
      }
    })
    const filteredAlbums = filterAlbumsByRating(
      albums,
      settings.explicitFilter || 'explicit',
    )
    const playlists = (r.playlists?.data || []).map((x) => ({
      id: x.id,
      type: x.type,
      name: x.attributes?.name,
      curatorName: x.attributes?.curatorName || 'Apple Music',
      trackCount: x.attributes?.trackCount,
      artworkTemplate: x.attributes?.artwork?.url || null,
      artworkColor: x.attributes?.artwork?.bgColor || null,
      url: x.attributes?.url,
      description: x.attributes?.description?.standard || '',
    }))
    res.json({ albums: filteredAlbums, artists, songs, playlists, storefront })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})
