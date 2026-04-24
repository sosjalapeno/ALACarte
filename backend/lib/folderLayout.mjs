import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

export function sanitizeSegment(name) {
  if (!name) return '_'
  return String(name)
    .replace(BAD_CHARS, '_')
    .replace(/\.+$/g, '')
    .trim()
    .slice(0, 200) || '_'
}

export async function resolveArtistDir(musicRoot, desiredArtist) {
  const desired = sanitizeSegment(desiredArtist)
  try {
    const entries = await fsp.readdir(musicRoot, { withFileTypes: true })
    const lower = desired.toLowerCase()
    const existing = entries.find(
      (e) => e.isDirectory() && e.name.toLowerCase() === lower,
    )
    if (existing) return existing.name
  } catch {}
  return desired
}

export async function computeFinalDir(musicRoot, artist, album, _year) {
  const artistDir = await resolveArtistDir(musicRoot, artist)
  const albumSeg = sanitizeSegment(album)
  return path.join(musicRoot, artistDir, albumSeg)
}

export async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true, mode: 0o775 })
}

export async function mergeMove(src, dest) {
  await ensureDir(dest)
  const entries = await fsp.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const from = path.join(src, e.name)
    const to = path.join(dest, e.name)
    if (e.isDirectory()) {
      await mergeMove(from, to)
    } else {
      try {
        await fsp.rename(from, to)
      } catch (err) {
        if (err.code === 'EXDEV') {
          await fsp.copyFile(from, to)
          await fsp.unlink(from)
        } else if (err.code === 'EEXIST') {
          await fsp.rm(to)
          await fsp.rename(from, to)
        } else {
          throw err
        }
      }
    }
  }
  try {
    await fsp.rmdir(src)
  } catch {}
}

export function pathExists(p) {
  return fs.existsSync(p)
}
