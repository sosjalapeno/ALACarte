import { getBearerToken, invalidateBearerCache } from './appleToken.mjs'

const ME = 'https://amp-api.music.apple.com/v1/me'
const LIBRARY_PAGE_SIZE = 100

async function apiGet(url, { mediaUserToken, language = 'en-US' } = {}) {
  if (!mediaUserToken) {
    const err = new Error('media-user-token not configured')
    err.code = 'NO_MEDIA_USER_TOKEN'
    err.statusCode = 412
    throw err
  }
  let token = await getBearerToken()
  const run = async (t) =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${t}`,
        'Music-User-Token': mediaUserToken,
        Origin: 'https://music.apple.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': language || 'en-US',
      },
    })
  let res = await run(token)
  if (res.status === 401) {
    invalidateBearerCache()
    token = await getBearerToken()
    res = await run(token)
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => '')
    const err = new Error(
      `Apple library ${res.status}: media-user-token rejected (${body.slice(0, 120)})`,
    )
    err.code = 'MEDIA_USER_TOKEN_REJECTED'
    err.statusCode = res.status
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Apple library ${res.status} on ${new URL(url).pathname}: ${body.slice(0, 200)}`,
    )
  }
  return res.json()
}

export async function getMyStorefront({ mediaUserToken, language } = {}) {
  const json = await apiGet(`${ME}/storefront`, { mediaUserToken, language })
  return json?.data?.[0]?.id || null
}

function buildLibraryUrl(kind, { offset = 0, limit = LIBRARY_PAGE_SIZE, language = 'en-US' } = {}) {
  const qs = new URLSearchParams({
    include: 'catalog',
    extend: 'playParams,catalogId',
    limit: String(Math.max(1, Math.min(limit, LIBRARY_PAGE_SIZE))),
    offset: String(Math.max(0, offset)),
    l: language,
  })
  if (kind === 'songs') {
    qs.set('include[library-songs]', 'catalog,albums')
    qs.set('include[songs]', 'albums')
  } else if (kind === 'albums') {
    qs.set('include[library-albums]', 'catalog')
  } else if (kind === 'playlists') {
    qs.set('include[library-playlists]', 'catalog')
  }
  return `${ME}/library/${kind}?${qs.toString()}`
}

const CATALOG_NUMERIC_RE = /^\d{6,15}$/
const CATALOG_PLAYLIST_RE = /^pl\.[A-Za-z0-9-]+$/
const LIBRARY_PREFIX_RE = /^[ilp]\./

export function isAppleCatalogId(id) {
  if (!id) return false
  const s = String(id)
  if (LIBRARY_PREFIX_RE.test(s)) return false
  return CATALOG_NUMERIC_RE.test(s) || CATALOG_PLAYLIST_RE.test(s)
}

function pickCatalogId(raw) {
  const pp = raw?.attributes?.playParams || {}
  if (pp.catalogId) return String(pp.catalogId)
  const rel = raw?.relationships?.catalog?.data
  if (Array.isArray(rel) && rel[0]?.id) return String(rel[0].id)
  if (pp.purchasedId && isAppleCatalogId(pp.purchasedId)) return String(pp.purchasedId)
  if (pp.id && isAppleCatalogId(pp.id)) return String(pp.id)
  return null
}

function pickCatalogPlaylistId(raw) {
  const rel = raw?.relationships?.catalog?.data
  if (Array.isArray(rel) && rel[0]?.id) return String(rel[0].id)
  const pp = raw?.attributes?.playParams || {}
  if (pp.globalId && CATALOG_PLAYLIST_RE.test(pp.globalId)) return String(pp.globalId)
  if (
    pp.id &&
    CATALOG_PLAYLIST_RE.test(pp.id) &&
    pp.isLibrary !== true &&
    raw?.attributes?.canEdit !== true
  ) {
    return String(pp.id)
  }
  return null
}

export function normalizeLibraryAlbum(raw) {
  if (!raw) return null
  const a = raw.attributes || {}
  const catalogId = pickCatalogId(raw)
  return {
    libraryId: raw.id,
    catalogId,
    name: a.name || 'Unknown album',
    artistName: a.artistName || 'Unknown artist',
    artworkTemplate: a.artwork?.url || null,
    artworkColor: a.artwork?.bgColor || null,
    trackCount: Number(a.trackCount || 0),
    dateAdded: a.dateAdded || null,
    downloadable: Boolean(catalogId),
  }
}

export function normalizeLibraryPlaylist(raw) {
  if (!raw) return null
  const a = raw.attributes || {}
  const catalogId = pickCatalogPlaylistId(raw)
  const isUserCreated = a.canEdit === true || a.playParams?.isLibrary === true && !catalogId
  return {
    libraryId: raw.id,
    catalogId,
    name: a.name || 'Untitled playlist',
    curatorName: a.curatorName || (isUserCreated ? 'You' : 'Apple Music'),
    description: a.description?.standard || '',
    artworkTemplate: a.artwork?.url || null,
    artworkColor: a.artwork?.bgColor || null,
    dateAdded: a.dateAdded || null,
    isUserCreated,
    downloadable: Boolean(catalogId),
  }
}

export function normalizeLibrarySong(raw, albumLookup) {
  if (!raw) return null
  const a = raw.attributes || {}
  const catalogId = pickCatalogId(raw)
  const catalogAlbumId =
    catalogId && albumLookup ? albumLookup.get(catalogId) || null : null
  return {
    libraryId: raw.id,
    catalogId,
    catalogAlbumId,
    name: a.name || 'Unknown song',
    artistName: a.artistName || 'Unknown artist',
    albumName: a.albumName || '',
    durationMs: Number(a.durationInMillis || 0),
    artworkTemplate: a.artwork?.url || null,
    contentRating: a.contentRating || null,
    downloadable: Boolean(catalogId),
  }
}

function buildSongAlbumLookup(included) {
  const map = new Map()
  if (!Array.isArray(included)) return map
  for (const entry of included) {
    if (entry?.type !== 'songs') continue
    const albumId = entry?.relationships?.albums?.data?.[0]?.id
    if (entry.id && albumId) map.set(String(entry.id), String(albumId))
  }
  return map
}

export async function fetchLibraryPage(kind, { mediaUserToken, language, offset, limit } = {}) {
  if (!['albums', 'playlists', 'songs'].includes(kind)) {
    throw new Error(`unknown library kind: ${kind}`)
  }
  const url = buildLibraryUrl(kind, { offset, limit, language })
  const json = await apiGet(url, { mediaUserToken, language })
  const data = json?.data || []
  let items
  if (kind === 'albums') {
    items = data.map(normalizeLibraryAlbum).filter(Boolean)
  } else if (kind === 'playlists') {
    items = data.map(normalizeLibraryPlaylist).filter(Boolean)
  } else {
    const lookup = buildSongAlbumLookup(json?.included)
    items = data.map((raw) => normalizeLibrarySong(raw, lookup)).filter(Boolean)
  }
  const next = typeof json?.next === 'string' ? json.next : null
  const total = typeof json?.meta?.total === 'number' ? json.meta.total : null
  return { items, next, total }
}

export async function* iterateLibrary(kind, { mediaUserToken, language, pageSize } = {}) {
  let offset = 0
  const limit = pageSize || LIBRARY_PAGE_SIZE
  while (true) {
    const page = await fetchLibraryPage(kind, {
      mediaUserToken,
      language,
      offset,
      limit,
    })
    for (const item of page.items) yield item
    if (!page.next || page.items.length === 0) return
    offset += page.items.length
    if (page.total !== null && offset >= page.total) return
  }
}

export const __test__ = {
  pickCatalogId,
  pickCatalogPlaylistId,
  buildLibraryUrl,
  LIBRARY_PAGE_SIZE,
}
