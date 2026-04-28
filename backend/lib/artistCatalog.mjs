import { getArtist } from './appleApi.mjs'
import { filterAlbumsByRating } from './contentRatingFilter.mjs'

export async function loadArtistCatalog({ artistId, storefront, language, explicitFilter }) {
  const raw = await getArtist({ storefront, id: artistId, language })
  const artist = raw?.data?.[0]
  if (!artist) return null

  const albums = (artist.relationships?.albums?.data || []).map((item) => ({
    id: item.id,
    type: item.type,
    name: item.attributes?.name,
    artistId: artist.id,
    artistName: item.attributes?.artistName || artist.attributes?.name,
    releaseDate: item.attributes?.releaseDate,
    year: item.attributes?.releaseDate
      ? String(item.attributes.releaseDate).slice(0, 4)
      : null,
    trackCount: item.attributes?.trackCount,
    artworkTemplate: item.attributes?.artwork?.url || null,
    artworkColor: item.attributes?.artwork?.bgColor || null,
    isSingle: item.attributes?.isSingle,
    contentRating: item.attributes?.contentRating,
  }))

  return {
    artist: {
      id: artist.id,
      name: artist.attributes?.name,
      genreNames: artist.attributes?.genreNames || [],
      url: artist.attributes?.url,
      artworkTemplate: artist.attributes?.artwork?.url || null,
      artworkColor: artist.attributes?.artwork?.bgColor || null,
    },
    albums: filterAlbumsByRating(albums, explicitFilter || 'explicit'),
  }
}
