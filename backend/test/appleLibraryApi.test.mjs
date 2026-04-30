import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeLibraryAlbum,
  normalizeLibraryPlaylist,
  normalizeLibrarySong,
  normalizeLibraryTrack,
  __test__,
} from '../lib/appleLibraryApi.mjs'

test('normalizeLibraryAlbum picks catalogId from playParams first', () => {
  const out = normalizeLibraryAlbum({
    id: 'l.abc',
    type: 'library-albums',
    attributes: {
      name: 'Songs',
      artistName: 'L. Cohen',
      trackCount: 10,
      playParams: { id: 'l.abc', kind: 'album', catalogId: '1568157108' },
      artwork: { url: 'https://x/{w}x{h}.{f}' },
    },
    relationships: {
      catalog: { data: [{ id: 'should-not-win', type: 'albums' }] },
    },
  })
  assert.equal(out.catalogId, '1568157108')
  assert.equal(out.downloadable, true)
  assert.equal(out.trackCount, 10)
})

test('normalizeLibraryAlbum falls back to relationships.catalog.data[0].id', () => {
  const out = normalizeLibraryAlbum({
    id: 'l.def',
    attributes: { name: 'X', artistName: 'Y' },
    relationships: { catalog: { data: [{ id: '999', type: 'albums' }] } },
  })
  assert.equal(out.catalogId, '999')
  assert.equal(out.downloadable, true)
})

test('normalizeLibraryAlbum returns null catalogId when neither source has it', () => {
  const out = normalizeLibraryAlbum({
    id: 'l.ghi',
    attributes: { name: 'Uploaded', artistName: 'Me' },
  })
  assert.equal(out.catalogId, null)
  assert.equal(out.downloadable, false)
})

test('normalizeLibraryAlbum picks catalogId from playParams.purchasedId when catalogId is missing', () => {
  const out = normalizeLibraryAlbum({
    id: 'l.purchased',
    attributes: {
      name: 'Purchased',
      artistName: 'X',
      playParams: { id: 'l.purchased', kind: 'album', purchasedId: '987654321' },
    },
  })
  assert.equal(out.catalogId, '987654321')
  assert.equal(out.downloadable, true)
})

test('normalizeLibrarySong picks catalogId from playParams.id when it looks like a catalog id', () => {
  const out = normalizeLibrarySong(
    {
      id: 'i.song',
      attributes: {
        name: 'Mystery Match',
        artistName: 'X',
        playParams: { id: '1453577124', kind: 'song' },
      },
    },
    new Map(),
  )
  assert.equal(out.catalogId, '1453577124')
  assert.equal(out.downloadable, true)
})

test('resolveMissingCatalogIds fills song catalog ids from ISRC lookup', async () => {
  const items = [
    normalizeLibrarySong(
      {
        id: 'i.antihero',
        attributes: {
          name: 'ANTI-HERO',
          artistName: 'Ghais Guevara',
          albumName: 'Goyard & The Kayfabe Reveal',
          isrc: 'QZTEST000001',
          playParams: { id: 'i.antihero', kind: 'song', isLibrary: true },
        },
      },
      new Map(),
    ),
  ]

  await __test__.resolveMissingCatalogIds('songs', items, {
    storefront: 'us',
    songResolver: async ({ storefront, isrcs }) => {
      assert.equal(storefront, 'us')
      assert.deepEqual(isrcs, ['QZTEST000001'])
      return {
        data: [
          {
            id: '1777777001',
            type: 'songs',
            attributes: {
              name: 'ANTI-HERO',
              artistName: 'Ghais Guevara',
              albumName: 'Goyard & The Kayfabe Reveal',
              isrc: 'QZTEST000001',
            },
            relationships: {
              albums: { data: [{ id: '1777777000', type: 'albums' }] },
            },
          },
        ],
      }
    },
  })

  assert.equal(items[0].catalogId, '1777777001')
  assert.equal(items[0].catalogAlbumId, '1777777000')
  assert.equal(items[0].downloadable, true)
})

test('normalizeLibrarySong leaves uploaded tracks with library-prefixed playParams.id as null', () => {
  const out = normalizeLibrarySong(
    {
      id: 'i.uploaded',
      attributes: {
        name: 'Demo',
        artistName: 'Me',
        playParams: { id: 'i.uploaded', kind: 'song', isLibrary: true },
      },
    },
    new Map(),
  )
  assert.equal(out.catalogId, null)
  assert.equal(out.downloadable, false)
})

test('resolveMissingCatalogIds leaves genuine uploaded songs unresolved', async () => {
  const items = [
    normalizeLibrarySong(
      {
        id: 'i.uploaded',
        attributes: {
          name: 'Demo',
          artistName: 'Me',
          playParams: { id: 'i.uploaded', kind: 'song', isLibrary: true },
        },
      },
      new Map(),
    ),
  ]

  await __test__.resolveMissingCatalogIds('songs', items, {
    storefront: 'us',
    songResolver: async () => {
      throw new Error('resolver should not run')
    },
  })

  assert.equal(items[0].catalogId, null)
  assert.equal(items[0].downloadable, false)
})

test('isAppleCatalogId rejects library-prefixed ids and accepts numeric or pl. ids', async () => {
  const { isAppleCatalogId } = await import('../lib/appleLibraryApi.mjs')
  assert.equal(isAppleCatalogId('1234567890'), true)
  assert.equal(isAppleCatalogId('pl.f4d106fed2bd41149aaacd893e8a9019'), true)
  assert.equal(isAppleCatalogId('i.B1XAOXltZdxJZMr'), false)
  assert.equal(isAppleCatalogId('l.purchased'), false)
  assert.equal(isAppleCatalogId('p.userlist'), false)
  assert.equal(isAppleCatalogId(''), false)
  assert.equal(isAppleCatalogId(null), false)
})

test('normalizeLibraryPlaylist marks user-created playlists not downloadable', () => {
  const out = normalizeLibraryPlaylist({
    id: 'p.userlist',
    attributes: {
      name: 'My Mix',
      canEdit: true,
      playParams: { id: 'p.userlist', kind: 'playlist', isLibrary: true },
    },
  })
  assert.equal(out.catalogId, null)
  assert.equal(out.isUserCreated, true)
  assert.equal(out.downloadable, false)
})

test('normalizeLibraryPlaylist captures catalog id for subscribed playlists', () => {
  const out = normalizeLibraryPlaylist({
    id: 'p.subscribed',
    attributes: {
      name: 'Curated',
      curatorName: 'Apple Music',
    },
    relationships: {
      catalog: { data: [{ id: 'pl.f4d106fed2bd41149aaacd893e8a9019', type: 'playlists' }] },
    },
  })
  assert.equal(out.catalogId, 'pl.f4d106fed2bd41149aaacd893e8a9019')
  assert.equal(out.isUserCreated, false)
  assert.equal(out.downloadable, true)
})

test('normalizeLibrarySong is downloadable when catalogId is present, with album hint when available', () => {
  const lookup = new Map([['12345', '99999']])
  const downloadable = normalizeLibrarySong(
    {
      id: 'l.song',
      attributes: {
        name: 'Hallelujah',
        artistName: 'L. Cohen',
        albumName: 'Various',
        durationInMillis: 273000,
        playParams: { catalogId: '12345' },
      },
    },
    lookup,
  )
  assert.equal(downloadable.catalogId, '12345')
  assert.equal(downloadable.catalogAlbumId, '99999')
  assert.equal(downloadable.durationMs, 273000)
  assert.equal(downloadable.downloadable, true)

  const albumless = normalizeLibrarySong(
    {
      id: 'l.song2',
      attributes: {
        name: 'Loose Track',
        artistName: 'Someone',
        playParams: { catalogId: '67890' },
      },
    },
    new Map(),
  )
  assert.equal(albumless.catalogId, '67890')
  assert.equal(albumless.catalogAlbumId, null)
  assert.equal(albumless.downloadable, true)

  const orphan = normalizeLibrarySong(
    {
      id: 'l.uploaded',
      attributes: { name: 'Demo', artistName: 'Me' },
    },
    lookup,
  )
  assert.equal(orphan.catalogId, null)
  assert.equal(orphan.catalogAlbumId, null)
  assert.equal(orphan.downloadable, false)
})

test('resolveMissingCatalogIds fills album catalog ids from UPC lookup', async () => {
  const items = [
    normalizeLibraryAlbum({
      id: 'l.hyperyouth',
      attributes: {
        name: 'HYPERYOUTH (afterparty)',
        artistName: 'Joey Valence & Brae',
        trackCount: 20,
        upc: '196874154854',
        playParams: { id: 'l.hyperyouth', kind: 'album', isLibrary: true },
      },
    }),
  ]

  await __test__.resolveMissingCatalogIds('albums', items, {
    storefront: 'us',
    albumResolver: async ({ storefront, upcs }) => {
      assert.equal(storefront, 'us')
      assert.deepEqual(upcs, ['196874154854'])
      return {
        data: [
          {
            id: '1888888000',
            type: 'albums',
            attributes: {
              name: 'HYPERYOUTH (afterparty)',
              artistName: 'Joey Valence & Brae',
              trackCount: 20,
              upc: '196874154854',
            },
          },
        ],
      }
    },
  })

  assert.equal(items[0].catalogId, '1888888000')
  assert.equal(items[0].downloadable, true)
})

test('normalizeLibraryTrack uses catalog id when present and marks downloadable accordingly', () => {
  const matched = normalizeLibraryTrack({
    id: 'i.song1',
    type: 'library-songs',
    attributes: {
      name: 'Anti-Hero',
      artistName: 'Ghais Guevara',
      albumName: 'Goyard & The Kayfabe Reveal',
      durationInMillis: 180_000,
      playParams: { id: 'i.song1', kind: 'song', catalogId: '1568157108' },
    },
  })
  assert.equal(matched.id, '1568157108')
  assert.equal(matched.libraryId, 'i.song1')
  assert.equal(matched.catalogId, '1568157108')
  assert.equal(matched.downloadable, true)
  assert.equal(matched.durationMs, 180_000)

  const upload = normalizeLibraryTrack({
    id: 'i.upload',
    type: 'library-songs',
    attributes: {
      name: 'Demo',
      artistName: 'Me',
      playParams: { id: 'i.upload', kind: 'song', isLibrary: true },
    },
  })
  assert.equal(upload.id, 'i.upload')
  assert.equal(upload.catalogId, null)
  assert.equal(upload.downloadable, false)
})

test('buildLibraryUrl clamps limit and offset and sets include=catalog', () => {
  const url = __test__.buildLibraryUrl('albums', { offset: -5, limit: 999 })
  const parsed = new URL(url)
  assert.equal(parsed.pathname, '/v1/me/library/albums')
  assert.equal(parsed.searchParams.get('include'), 'catalog')
  assert.equal(parsed.searchParams.get('offset'), '0')
  assert.equal(parsed.searchParams.get('limit'), String(__test__.LIBRARY_PAGE_SIZE))
})
