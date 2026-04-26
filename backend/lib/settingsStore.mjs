import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

import { getRawKey } from './secretKey.mjs'

const CONFIG_DIR = process.env.AMDL_CONFIG_DIR || '/config'
const SECRET_FILE = path.join(CONFIG_DIR, '.secret')
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json')

const DEFAULTS = {
  storefront: 'us',
  language: 'en-US',
  quality: 'alac',
  albumFolderFormat: '{AlbumName} ({ReleaseYear})',
  artistFolderFormat: '{ArtistName}',
  songFileFormat: '{SongNumer}. {SongName}',
  convertToFlac: true,
  keepAlac: false,
  coverSize: '1400x1400',
  downloadLyrics: false,
  lyricsFormat: 'lrc',
  lyricsType: 'lyrics',
  explicitFilter: 'explicit',
  appleEmail: null,
  applePassword: null,
  mediaUserToken: null,
}

export async function ensureConfigDir(dir = CONFIG_DIR) {
  await fsp.mkdir(dir, { recursive: true, mode: 0o750 })
  if (!fs.existsSync(SECRET_FILE)) {
    let key = (process.env.AMDL_SECRET_KEY || '').trim()
    if (!/^[0-9a-f]{64}$/i.test(key)) {
      key = crypto.randomBytes(32).toString('hex')
    }
    await fsp.writeFile(SECRET_FILE, key, { mode: 0o600 })
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    await fsp.writeFile(
      SETTINGS_FILE,
      JSON.stringify(DEFAULTS, null, 2),
      { mode: 0o600 },
    )
  }
}

export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null
  const key = getRawKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(b64) {
  if (!b64) return null
  try {
    const key = getRawKey()
    const buf = Buffer.from(b64, 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    )
  } catch (err) {
    console.error('Failed to decrypt secret:', err.message)
    return null
  }
}

export async function readSettings() {
  try {
    const raw = await fsp.readFile(SETTINGS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function writeSettings(patch) {
  const current = await readSettings()
  const next = { ...current, ...patch }
  await fsp.writeFile(
    SETTINGS_FILE,
    JSON.stringify(next, null, 2),
    { mode: 0o600 },
  )
  return next
}

function maskEmail(e) {
  const [u, d] = String(e).split('@')
  if (!d) return '••••'
  const masked = u.length <= 2 ? u[0] || '•' : u[0] + '•••' + u.slice(-1)
  return `${masked}@${d}`
}

export async function readPublicSettings() {
  const s = await readSettings()
  return {
    storefront: s.storefront,
    language: s.language,
    quality: s.quality,
    albumFolderFormat: s.albumFolderFormat,
    artistFolderFormat: s.artistFolderFormat,
    songFileFormat: s.songFileFormat,
    convertToFlac: s.convertToFlac,
    keepAlac: s.keepAlac,
    coverSize: s.coverSize,
    downloadLyrics: Boolean(s.downloadLyrics),
    lyricsFormat: s.lyricsFormat || 'lrc',
    lyricsType: s.lyricsType || 'lyrics',
    explicitFilter: s.explicitFilter || 'explicit',
    appleEmailMasked: s.appleEmail
      ? maskEmail(decryptSecret(s.appleEmail) || '')
      : null,
    hasAppleCreds: Boolean(s.appleEmail && s.applePassword),
    hasMediaUserToken: Boolean(s.mediaUserToken),
  }
}

export async function readAppleCreds() {
  const s = await readSettings()
  return {
    email: decryptSecret(s.appleEmail),
    password: decryptSecret(s.applePassword),
    mediaUserToken: decryptSecret(s.mediaUserToken),
  }
}
