import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeLibraryAlbum,
  normalizeLibraryPlaylist,
  normalizeLibrarySong,
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

test('normalizeLibrarySong is downloadable only when album lookup resolves the catalog album id', () => {
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

test('buildLibraryUrl clamps limit and offset and sets include=catalog', () => {
  const url = __test__.buildLibraryUrl('albums', { offset: -5, limit: 999 })
  const parsed = new URL(url)
  assert.equal(parsed.pathname, '/v1/me/library/albums')
  assert.equal(parsed.searchParams.get('include'), 'catalog')
  assert.equal(parsed.searchParams.get('offset'), '0')
  assert.equal(parsed.searchParams.get('limit'), String(__test__.LIBRARY_PAGE_SIZE))
})
