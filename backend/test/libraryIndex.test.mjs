import { test } from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function withMusicRoot(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'alacarte-music-'))
  const prevRoot = process.env.AMDL_MUSIC_PATH
  process.env.AMDL_MUSIC_PATH = dir
  try {
    const mod = await import(`../lib/libraryIndex.mjs?ts=${Date.now()}`)
    mod.invalidateLibraryCache()
    await fn(dir, mod)
  } finally {
    process.env.AMDL_MUSIC_PATH = prevRoot
    await fsp.rm(dir, { recursive: true, force: true })
  }
}

test('songNameFromFilename strips track-number prefix and extension', async () => {
  const { songNameFromFilename } = await import('../lib/libraryIndex.mjs')
  assert.equal(songNameFromFilename('04. After That.flac'), 'After That')
  assert.equal(songNameFromFilename('01 - Intro.m4a'), 'Intro')
  assert.equal(songNameFromFilename('12 Track Name.mp3'), 'Track Name')
  assert.equal(songNameFromFilename('Plain Title.flac'), 'Plain Title')
  assert.equal(songNameFromFilename('07. Song Name [E].flac'), 'Song Name')
})

test('scanLibrary indexes album-folder tracks into songKeys and albumTrackKeys', async () => {
  await withMusicRoot(async (root, mod) => {
    const albumDir = path.join(root, 'Future', 'Monster')
    await fsp.mkdir(albumDir, { recursive: true })
    await fsp.writeFile(path.join(albumDir, '04. After That.flac'), 'x')
    await fsp.writeFile(path.join(albumDir, '01. Intro.flac'), 'x')

    const idx = await mod.scanLibrary()
    assert.ok(idx.songKeys.has(mod.makeSongKey('Future', 'After That')))
    assert.ok(idx.songKeys.has(mod.makeSongKey('Future', 'Intro')))
    const trackSet = idx.albumTrackKeys.get(mod.makeAlbumKey('Future', 'Monster'))
    assert.ok(trackSet)
    assert.equal(trackSet.size, 2)
  })
})

test('getAlbumTrackPresence reports per-track presence and complete flag', async () => {
  await withMusicRoot(async (root, mod) => {
    const singlesDir = path.join(root, 'Future', 'Singles')
    await fsp.mkdir(singlesDir, { recursive: true })
    await fsp.writeFile(path.join(singlesDir, 'After That.flac'), 'x')

    const presence = await mod.getAlbumTrackPresence('Future', 'Monster', [
      { id: 't1', name: 'After That' },
      { id: 't2', name: 'Other Track' },
    ])
    assert.equal(presence.tracks.t1, true)
    assert.equal(presence.tracks.t2, false)
    assert.equal(presence.present, 1)
    assert.equal(presence.expected, 2)
    assert.equal(presence.complete, false)
    assert.equal(presence.folderExists, false)
  })
})

test('getAlbumTrackPresence marks complete when album folder has every track', async () => {
  await withMusicRoot(async (root, mod) => {
    const albumDir = path.join(root, 'Future', 'Monster')
    await fsp.mkdir(albumDir, { recursive: true })
    await fsp.writeFile(path.join(albumDir, '01. After That.flac'), 'x')
    await fsp.writeFile(path.join(albumDir, '02. Other Track.flac'), 'x')

    const presence = await mod.getAlbumTrackPresence('Future', 'Monster', [
      { id: 't1', name: 'After That' },
      { id: 't2', name: 'Other Track' },
    ])
    assert.equal(presence.present, 2)
    assert.equal(presence.expected, 2)
    assert.equal(presence.complete, true)
    assert.equal(presence.folderExists, true)
  })
})
