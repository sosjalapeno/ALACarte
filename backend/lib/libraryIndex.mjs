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

  const artists = await readDirSafe(MUSIC_ROOT)
  for (const artistEntry of artists) {
    if (!artistEntry.isDirectory()) continue
    if (artistEntry.name.startsWith('.')) continue

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
          songKeys.add(makeSongKey(artistName, songName))
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
      albumKeys.add(makeAlbumKey(artistName, albumName))
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

  return { albums, singles, albumKeys, songKeys }
}

export async function hasAlbumInLibrary(artistName, albumName, preScannedIndex = null) {
  const key = makeAlbumKey(artistName, stripTrailingYear(albumName))
  if (!key) return false
  const index = preScannedIndex || (await getCachedIndex())
  return index.albumKeys.has(key)
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
