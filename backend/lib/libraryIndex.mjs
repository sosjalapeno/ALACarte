import fsp from 'node:fs/promises'
import path from 'node:path'

import { sanitizeSegment } from './folderLayout.mjs'

const MUSIC_ROOT = process.env.AMDL_MUSIC_PATH || '/music'
const AUDIO_RE = /\.(flac|m4a|mp3)$/i

const SCAN_TTL_MS = 30_000
let _scanCache = null
let _scanCacheAt = 0

async function getCachedIndex() {
  const now = Date.now()
  if (_scanCache && now - _scanCacheAt < SCAN_TTL_MS) return _scanCache
  _scanCache = await scanLibrary()
  _scanCacheAt = now
  return _scanCache
}

export function invalidateLibraryCache() {
  _scanCache = null
  _scanCacheAt = 0
}

export async function scanLibraryOnce() {
  return getCachedIndex()
}

export async function scanLibrary() {
  const albums = []
  const singles = []
  const albumKeys = new Set()
  const songKeys = new Set()
  const albumTrackKeys = new Map()
  const singlesSongKeys = new Set()
  const playlistIds = new Set()

  const playlistsDir = path.join(MUSIC_ROOT, 'Playlists')
  const playlistEntries = await readDirSafe(playlistsDir)
  for (const entry of playlistEntries) {
    if (!entry.isFile() || !/\.m3u8$/i.test(entry.name)) continue
    const id = await readPlaylistId(path.join(playlistsDir, entry.name))
    if (id) playlistIds.add(id)
  }

  const artists = await readDirSafe(MUSIC_ROOT)
  for (const artistEntry of artists) {
    if (!artistEntry.isDirectory()) continue
    if (artistEntry.name.startsWith('.')) continue
    if (artistEntry.name === 'Playlists') continue

    const artistName = artistEntry.name
    const artistPath = path.join(MUSIC_ROOT, artistName)
    const children = await readDirSafe(artistPath)

    for (const child of children) {
      if (!child.isDirectory()) continue
      if (child.name.startsWith('.')) continue

      const childPath = path.join(artistPath, child.name)
      if (child.name.toLowerCase() === 'singles') {
        const files = await readDirSafe(childPath)
        for (const file of files) {
          if (!file.isFile() || !AUDIO_RE.test(file.name)) continue

          const audioPath = path.join(childPath, file.name)
          const songName = path.basename(file.name, path.extname(file.name))
          const relPath = toRel(audioPath)
          const hasLyrics = await hasSiblingLrc(audioPath)
          const songStat = await fsp.stat(audioPath).catch(() => null)
          const addedAt = Math.round(
            songStat?.mtimeMs || songStat?.ctimeMs || songStat?.birthtimeMs || 0,
          )

          singles.push({
            id: relPath,
            artistName,
            songName,
            relPath,
            hasLyrics,
            addedAt,
          })
          const songKey = makeSongKey(artistName, songName)
          if (songKey) {
            songKeys.add(songKey)
            singlesSongKeys.add(songKey)
          }
        }
        continue
      }

      const files = await readDirSafe(childPath)
      const audioFiles = files.filter((f) => f.isFile() && AUDIO_RE.test(f.name))
      if (audioFiles.length === 0) continue

      let lyricsCount = 0
      for (const file of audioFiles) {
        const audioPath = path.join(childPath, file.name)
        if (await hasSiblingLrc(audioPath)) lyricsCount++
      }

      const relPath = toRel(childPath)
      const albumName = child.name
      const albumStat = await fsp.stat(childPath).catch(() => null)
      const addedAt = Math.round(
        albumStat?.mtimeMs || albumStat?.ctimeMs || albumStat?.birthtimeMs || 0,
      )
      albums.push({
        id: relPath,
        artistName,
        albumName,
        relPath,
        trackCount: audioFiles.length,
        lyricsCount,
        hasLyrics: lyricsCount > 0,
        addedAt,
      })
      const albumKey = makeAlbumKey(artistName, albumName)
      albumKeys.add(albumKey)
      const trackSet = new Set()
      for (const file of audioFiles) {
        const songName = songNameFromFilename(file.name)
        if (!songName) continue
        const songKey = makeSongKey(artistName, songName)
        if (!songKey) continue
        songKeys.add(songKey)
        trackSet.add(songKey)
      }
      if (albumKey) albumTrackKeys.set(albumKey, trackSet)
    }
  }

  singles.sort((a, b) =>
    `${a.artistName}\u0000${a.songName}`.localeCompare(
      `${b.artistName}\u0000${b.songName}`,
    ),
  )
  albums.sort((a, b) =>
    `${a.artistName}\u0000${a.albumName}`.localeCompare(
      `${b.artistName}\u0000${b.albumName}`,
    ),
  )

  return {
    albums,
    singles,
    albumKeys,
    songKeys,
    albumTrackKeys,
    singlesSongKeys,
    playlistIds,
  }
}

export function songNameFromFilename(filename) {
  if (!filename) return ''
  let base = String(filename).replace(/\.(flac|m4a|mp3)$/i, '')
  // Strip leading "NN. " or "NN - " or "NN " track-number prefix.
  base = base.replace(/^\s*\d{1,3}\s*[.\-]?\s+/, '')
  // Strip the [E]/[C]/[M] choice tags amdp may append.
  base = base.replace(/\s*\[[ECM]\]\s*$/i, '')
  return base.trim()
}

async function readPlaylistId(filePath) {
  try {
    const fh = await fsp.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(2048)
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      const head = buf.subarray(0, bytesRead).toString('utf8')
      const lines = head.split(/\r?\n/, 12)
      for (const line of lines) {
        const m = line.match(/^#ALACARTE_PLAYLIST_ID:(.+)$/)
        if (m) return m[1].trim()
      }
    } finally {
      await fh.close()
    }
  } catch {
    /* ignore */
  }
  return null
}

export async function isPlaylistInLibrary(playlistId, preScannedIndex = null) {
  if (!playlistId) return false
  const index = preScannedIndex || (await getCachedIndex())
  return index.playlistIds.has(String(playlistId))
}

export async function hasAlbumInLibrary(artistName, albumName, preScannedIndex = null) {
  const key = makeAlbumKey(artistName, stripTrailingYear(albumName))
  if (!key) return false
  const index = preScannedIndex || (await getCachedIndex())
  return index.albumKeys.has(key)
}

export async function getAlbumTrackPresence(artistName, albumName, tracks, preScannedIndex = null) {
  const index = preScannedIndex || (await getCachedIndex())
  const albumKey = makeAlbumKey(artistName, albumName)
  const albumTrackSet = albumKey ? index.albumTrackKeys.get(albumKey) || null : null
  const singlesSet = index.singlesSongKeys || new Set()
  const present = {}
  let count = 0
  for (const track of tracks || []) {
    const id = String(track?.id || '')
    if (!id) continue
    const songKey = makeSongKey(artistName, track?.name || '')
    const has = Boolean(
      songKey && ((albumTrackSet && albumTrackSet.has(songKey)) || singlesSet.has(songKey)),
    )
    present[id] = has
    if (has) count += 1
  }
  const expected = (tracks || []).length
  return {
    tracks: present,
    present: count,
    expected,
    complete: expected > 0 && count === expected && Boolean(albumTrackSet),
    folderExists: Boolean(albumTrackSet),
  }
}

export async function hasSongInLibrary(artistName, songName, preScannedIndex = null) {
  const key = makeSongKey(artistName, songName)
  if (!key) return false
  const index = preScannedIndex || (await getCachedIndex())
  return index.songKeys.has(key)
}

export function makeAlbumKey(artistName, albumName) {
  const artistKey = sanitizeSegment(artistName).toLowerCase()
  const albumKey = sanitizeSegment(stripTrailingYear(albumName)).toLowerCase()
  if (!artistKey || !albumKey || artistKey === '_' || albumKey === '_') return ''
  return `${artistKey}::${albumKey}`
}

export function makeSongKey(artistName, songName) {
  const artistKey = sanitizeSegment(artistName).toLowerCase()
  const songKey = sanitizeSegment(songName).toLowerCase()
  if (!artistKey || !songKey || artistKey === '_' || songKey === '_') return ''
  return `${artistKey}::${songKey}`
}

export function stripTrailingYear(title) {
  if (!title) return title
  return String(title)
    .replace(/\s*[([]\d{4}[)\]]\s*$/, '')
    .trim()
}

async function hasSiblingLrc(audioPath) {
  const lrcPath = path.join(
    path.dirname(audioPath),
    `${path.basename(audioPath, path.extname(audioPath))}.lrc`,
  )
  const stat = await fsp.stat(lrcPath).catch(() => null)
  return Boolean(stat?.isFile())
}

function readDirSafe(dir) {
  return fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
}

function toRel(absPath) {
  return path.relative(MUSIC_ROOT, absPath).split(path.sep).join('/')
}
