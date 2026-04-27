import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

import { emitEvent } from './eventBus.mjs'
import { readSettings, readAppleCreds } from './settingsStore.mjs'
import {
  getAlbum,
  getPlaylist,
  normalizeAlbum,
  normalizePlaylist,
} from './appleApi.mjs'
import { writeAmdpConfig, spawnAmdp } from './amdpRunner.mjs'
import {
  convertDirToFlac,
  extractFolderArt,
} from './flacConvert.mjs'
import {
  computeFinalDir,
  ensureDir,
  mergeMove,
  resolveArtistDir,
  sanitizeSegment,
} from './folderLayout.mjs'
import { hasAlbumInLibrary, hasSongInLibrary, stripTrailingYear } from './libraryIndex.mjs'

const MUSIC_ROOT = process.env.AMDL_MUSIC_PATH || '/music'
const STAGING_ROOT = path.join(MUSIC_ROOT, '.amdl-tmp')
const CONFIG_DIR = process.env.AMDL_CONFIG_DIR || '/config'
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.ndjson')
const MAX_HISTORY = 500
const MAX_CONCURRENT = 1

const state = {
  jobs: new Map(), // id -> job
  queue: [], // job ids
  active: new Set(),
  running: new Map(), // id -> abortController
}

function createProgressState(job, { convertEnabled }) {
  const knownTotal = Number(job?.stats?.total || 0)
  const fallbackTotal = job?.kind === 'song' ? 1 : 10
  const downloadTotal = knownTotal > 0 ? knownTotal : fallbackTotal
  return {
    downloadTotal,
    downloadDone: 0,
    downloadPartial: 0,
    convertEnabled: Boolean(convertEnabled),
    convertTotal: Boolean(convertEnabled) ? downloadTotal : 0,
    convertDone: 0,
    finalizeProgress: 0,
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function computeProgressPercent(state) {
  const downloadDoneUnits = Math.min(
    state.downloadTotal,
    Math.max(0, state.downloadDone) +
      (state.downloadDone < state.downloadTotal
        ? clamp01(state.downloadPartial)
        : 0),
  )
  const convertDoneUnits = state.convertEnabled
    ? Math.min(state.convertTotal, Math.max(0, state.convertDone))
    : 0
  const finalizeDoneUnits = clamp01(state.finalizeProgress)
  const totalUnits = Math.max(
    1,
    state.downloadTotal + (state.convertEnabled ? state.convertTotal : 0) + 1,
  )
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((downloadDoneUnits + convertDoneUnits + finalizeDoneUnits) / totalUnits) *
          100,
      ),
    ),
  )
}

function applyProgress(job, progressState, patch = {}) {
  updateJob(job.id, {
    ...patch,
    progress: computeProgressPercent(progressState),
  })
}

export function listJobs() {
  const all = [...state.jobs.values()]
  all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return all
}

export function getJob(id) {
  return state.jobs.get(id) || null
}

function updateJob(id, patch) {
  const j = state.jobs.get(id)
  if (!j) return
  Object.assign(j, patch, { updatedAt: Date.now() })
  emitEvent('job.update', jobPublic(j))
}

function jobPublic(j) {
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    progress: j.progress,
    albumId: j.albumId,
    songId: j.songId || null,
    playlistId: j.playlistId || null,
    albumTitle: j.albumTitle,
    artist: j.artist,
    artistId: j.artistId || null,
    artworkUrl: j.artworkUrl,
    currentTrack: j.currentTrack,
    message: j.message,
    error: j.error,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    finalDir: j.finalDir,
    stats: j.stats,
  }
}

function alreadyInLibraryError(message) {
  const err = new Error(message)
  err.code = 'ALREADY_IN_LIBRARY'
  err.statusCode = 409
  return err
}

async function appendHistory(j) {
  try {
    await fsp.appendFile(
      HISTORY_FILE,
      JSON.stringify(jobPublic(j)) + '\n',
      { mode: 0o600 },
    )
    const stat = await fsp.stat(HISTORY_FILE).catch(() => null)
    if (stat && stat.size > 2_000_000) {
      const raw = await fsp.readFile(HISTORY_FILE, 'utf8')
      const lines = raw.trim().split('\n').slice(-MAX_HISTORY)
      await fsp.writeFile(HISTORY_FILE, lines.join('\n') + '\n', {
        mode: 0o600,
      })
    }
  } catch (err) {
    console.error('history write failed', err.message)
  }
}

export async function enqueueAlbum({ albumId, storefront, quality = 'alac' }) {
  for (const j of state.jobs.values()) {
    if (
      j.albumId === albumId &&
      (j.status === 'queued' || j.status === 'running')
    ) {
      return jobPublic(j)
    }
  }

  const id = crypto.randomUUID()
  const settings = await readSettings()
  let meta = null
  try {
    const raw = await getAlbum({
      storefront: storefront || settings.storefront,
      id: albumId,
      language: settings.language,
    })
    meta = normalizeAlbum(raw?.data?.[0])
  } catch (err) {
    console.error('album metadata lookup failed', err.message)
  }

  if (
    meta?.artistName &&
    meta?.name &&
    (await hasAlbumInLibrary(meta.artistName, meta.name))
  ) {
    throw alreadyInLibraryError('Already in library')
  }

  const job = {
    id,
    kind: 'album',
    status: 'queued',
    progress: 0,
    albumId,
    albumTitle: stripTrailingYear(meta?.name) || 'Unknown album',
    artist: meta?.artistName || 'Unknown artist',
    artistId: meta?.artistId || null,
    year: meta?.year || null,
    artworkUrl: meta?.artworkTemplate
      ? meta.artworkTemplate
          .replace('{w}', '600')
          .replace('{h}', '600')
          .replace('{f}', 'jpg')
      : null,
    storefront: storefront || settings.storefront || 'us',
    quality,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentTrack: null,
    message: 'Queued',
    error: null,
    finalDir: null,
    stats: { total: meta?.trackCount || 0, done: 0, failed: 0 },
  }
  state.jobs.set(id, job)
  state.queue.push(id)
  emitEvent('job.created', jobPublic(job))
  setImmediate(tickQueue)
  return jobPublic(job)
}

export async function enqueuePlaylist({ playlistId, storefront, quality = 'alac' }) {
  if (!playlistId) throw new Error('playlistId required')

  for (const j of state.jobs.values()) {
    if (
      j.kind === 'playlist' &&
      j.playlistId === playlistId &&
      (j.status === 'queued' || j.status === 'running')
    ) {
      return jobPublic(j)
    }
  }

  const id = crypto.randomUUID()
  const settings = await readSettings()

  let meta = null
  try {
    const raw = await getPlaylist({
      storefront: storefront || settings.storefront,
      id: playlistId,
      language: settings.language,
    })
    meta = normalizePlaylist(raw?.data?.[0])
  } catch (err) {
    console.error('playlist metadata lookup failed', err.message)
  }

  const job = {
    id,
    kind: 'playlist',
    status: 'queued',
    progress: 0,
    albumId: '',
    playlistId,
    sourceUrl:
      meta?.url ||
      `https://music.apple.com/${encodeURIComponent(storefront || settings.storefront || 'us')}/playlist/_/${encodeURIComponent(playlistId)}`,
    albumTitle: meta?.name || 'Unknown playlist',
    artist: meta?.curatorName || 'Apple Music',
    artistId: meta?.curatorId || null,
    year: null,
    artworkUrl: meta?.artworkTemplate
      ? meta.artworkTemplate
          .replace('{w}', '600')
          .replace('{h}', '600')
          .replace('{f}', 'jpg')
      : null,
    storefront: storefront || settings.storefront || 'us',
    quality,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentTrack: null,
    message: 'Queued',
    error: null,
    finalDir: null,
    stats: { total: meta?.trackCount || meta?.tracks?.length || 0, done: 0, failed: 0 },
  }

  state.jobs.set(id, job)
  state.queue.push(id)
  emitEvent('job.created', jobPublic(job))
  setImmediate(tickQueue)
  return jobPublic(job)
}

export async function enqueueSong({ songId, albumId, storefront }) {
  if (!songId) throw new Error('songId required')
  if (!albumId) throw new Error('albumId required')

  for (const j of state.jobs.values()) {
    if (
      j.kind === 'song' &&
      j.songId === songId &&
      (j.status === 'queued' || j.status === 'running')
    ) {
      return jobPublic(j)
    }
  }

  const id = crypto.randomUUID()
  const settings = await readSettings()
  let meta = null
  let trackMeta = null
  try {
    const raw = await getAlbum({
      storefront: storefront || settings.storefront,
      id: albumId,
      language: settings.language,
    })
    meta = normalizeAlbum(raw?.data?.[0])
    const tracks = raw?.data?.[0]?.relationships?.tracks?.data || []
    trackMeta = tracks.find((t) => t.id === songId) || null
  } catch (err) {
    console.error('song metadata lookup failed', err.message)
  }

  const trackName = trackMeta?.attributes?.name || 'Unknown track'

  if (
    meta?.artistName &&
    trackName &&
    trackName !== 'Unknown track' &&
    (await hasSongInLibrary(meta.artistName, trackName))
  ) {
    throw alreadyInLibraryError('Already in library')
  }

  const job = {
    id,
    kind: 'song',
    status: 'queued',
    progress: 0,
    albumId,
    songId,
    albumTitle: trackName,
    artist: meta?.artistName || 'Unknown artist',
    artistId: meta?.artistId || null,
    year: meta?.year || null,
    artworkUrl: meta?.artworkTemplate
      ? meta.artworkTemplate
          .replace('{w}', '600')
          .replace('{h}', '600')
          .replace('{f}', 'jpg')
      : null,
    storefront: storefront || settings.storefront || 'us',
    quality: 'alac',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentTrack: null,
    message: 'Queued',
    error: null,
    finalDir: null,
    stats: { total: 1, done: 0, failed: 0 },
  }
  state.jobs.set(id, job)
  state.queue.push(id)
  emitEvent('job.created', jobPublic(job))
  setImmediate(tickQueue)
  return jobPublic(job)
}

export async function cancelJob(id) {
  const j = state.jobs.get(id)
  if (!j) return { ok: false, error: 'not found' }
  if (j.status === 'done' || j.status === 'failed') {
    return { ok: true, noop: true }
  }
  const ctl = state.running.get(id)
  if (ctl) ctl.abort()
  state.queue = state.queue.filter((qid) => qid !== id)
  updateJob(id, {
    status: 'failed',
    error: 'Cancelled',
    message: 'Cancelled',
  })
  appendHistory(j).catch(() => {})
  return { ok: true }
}

async function tickQueue() {
  while (state.active.size < MAX_CONCURRENT && state.queue.length > 0) {
    const id = state.queue.shift()
    const job = state.jobs.get(id)
    if (!job || job.status !== 'queued') continue
    state.active.add(id)
    runJob(job).finally(() => {
      state.active.delete(id)
      setImmediate(tickQueue)
    })
  }
}

async function runJob(job) {
  try {
    updateJob(job.id, { status: 'running', message: 'Preparing' })
    const mp4box = probeMp4Box()
    if (!mp4box.ok) {
      throw new Error(
        `MP4Box preflight failed: ${mp4box.error}. Rebuild the web image so apple-music-dl can finalize MP4 files.`,
      )
    }
    await ensureDir(STAGING_ROOT)
    const jobStaging = path.join(STAGING_ROOT, job.id)
    await ensureDir(jobStaging)

    const settings = await readSettings()
    const progressState = createProgressState(job, {
      convertEnabled: settings.convertToFlac !== false,
    })
    const creds = await readAppleCreds()
    await writeAmdpConfig({
      settings,
      mediaUserToken: creds.mediaUserToken,
      stagingRoot: jobStaging,
    })

    const isSong = job.kind === 'song'
    const isPlaylist = job.kind === 'playlist'
    const baseUrl = `https://music.apple.com/${encodeURIComponent(job.storefront)}/album/_/${encodeURIComponent(job.albumId)}`
    const playlistUrl =
      job.sourceUrl ||
      `https://music.apple.com/${encodeURIComponent(job.storefront)}/playlist/_/${encodeURIComponent(job.playlistId || '')}`
    const url = isPlaylist
      ? playlistUrl
      : isSong
        ? `${baseUrl}?i=${encodeURIComponent(job.songId)}`
        : baseUrl
    const args = []
    if (isSong) args.push('--song')
    if (job.quality === 'atmos') args.push('--atmos')
    else if (job.quality === 'aac') args.push('--aac')
    args.push(url)

    const ctl = new AbortController()
    state.running.set(job.id, ctl)

    applyProgress(job, progressState, {
      message: 'Downloading from Apple Music',
    })

    const { waitExit } = spawnAmdp({
      args,
      cwd: jobStaging, // amdp reads ./config.yaml from cwd
      signal: ctl.signal,
      onLine: ({ line, which }) => {
        handleAmdpLine(job, line, which, progressState)
      },
    })
    const { code, stdout, stderr } = await waitExit
    state.running.delete(job.id)

    const combined = `${stdout}\n${stderr}`
    if (code !== 0) {
      throw new Error(
        `amdp exited ${code}: ${stderr.slice(-400).trim() || 'no stderr'}`,
      )
    }

    if (/load Config failed/i.test(combined)) {
      const line =
        combined
          .split(/\r?\n/)
          .find((l) => /load Config failed/i.test(l)) || ''
      throw new Error(`amdp config error: ${line.trim()}`)
    }

    const remuxError = detectAmdpRemuxError(combined)
    if (remuxError) {
      throw new Error(remuxError)
    }

    progressState.downloadDone = progressState.downloadTotal
    progressState.downloadPartial = 0
    applyProgress(job, progressState, {
      message: progressState.convertEnabled
        ? 'Preparing FLAC conversion'
        : 'Finalizing import',
      currentTrack: null,
    })

    if (isPlaylist) {
      if (progressState.convertEnabled) {
        applyProgress(job, progressState, {
          message: 'Converting to FLAC',
          currentTrack: null,
        })
        const conv = await convertDirToFlac(jobStaging, {
          onProgress: ({ index, total }) => {
            if (total > 0) {
              progressState.convertTotal = total
            }
            progressState.convertDone = Math.max(
              progressState.convertDone,
              Math.min(progressState.convertTotal || index, index),
            )
            applyProgress(job, progressState, {
              message: `Converting to FLAC (${index}/${progressState.convertTotal || total || index})`,
            })
          },
        })
        job.stats.converted = conv.converted
        job.stats.flacFailed = conv.failed
        if (conv.total > 0) {
          progressState.convertTotal = conv.total
          progressState.convertDone = Math.max(progressState.convertDone, conv.total)
        }
        progressState.convertDone = Math.max(
          progressState.convertDone,
          progressState.convertTotal,
        )
        applyProgress(job, progressState, {
          message: 'Converting to FLAC',
        })
      }

      progressState.finalizeProgress = Math.max(progressState.finalizeProgress, 0.55)
      applyProgress(job, progressState, {
        message: 'Moving into library',
        currentTrack: null,
      })

      const importedTracks = await importPlaylistTracks({
        job,
        jobStaging,
        onProgress: ({ done, total }) => {
          if (total > 0) {
            progressState.finalizeProgress = Math.max(
              progressState.finalizeProgress,
              0.55 + (Math.min(total, done) / total) * 0.35,
            )
            applyProgress(job, progressState, {
              message: `Moving into library (${done}/${total})`,
              currentTrack: null,
            })
          }
        },
      })
      if (importedTracks.length === 0) {
        throw new Error('no audio files in final folder')
      }
      job.stats.done = importedTracks.length

      progressState.finalizeProgress = Math.max(progressState.finalizeProgress, 0.93)
      applyProgress(job, progressState, {
        message: 'Writing playlist file',
        currentTrack: null,
      })
      const playlistPath = await writePlaylistM3U({
        playlistName: job.albumTitle,
        playlistId: job.playlistId,
        tracks: importedTracks,
      })

      try {
        await fsp.rm(jobStaging, { recursive: true, force: true })
      } catch {
        /* ignore */
      }

      progressState.finalizeProgress = 1
      applyProgress(job, progressState, {
        message: 'Finalizing import',
        currentTrack: null,
      })

      updateJob(job.id, {
        status: 'done',
        progress: 100,
        message: `Imported ${importedTracks.length} tracks`,
        finalDir: path.dirname(playlistPath),
      })
      await appendHistory(job)
      return
    }

    const artistDirs = await fsp.readdir(jobStaging, { withFileTypes: true })
    const firstArtist = artistDirs.find((e) => e.isDirectory())
    if (!firstArtist) {
      const tail = combined.slice(-600).trim()
      throw new Error(
        `amdp produced no artist folder. amdp output tail: ${tail || '(empty)'}`,
      )
    }
    const artistPath = path.join(jobStaging, firstArtist.name)
    const albumDirs = await fsp.readdir(artistPath, { withFileTypes: true })
    const firstAlbum = albumDirs.find((e) => e.isDirectory())
    if (!firstAlbum) throw new Error('amdp produced no album folder')
    const albumPath = path.join(artistPath, firstAlbum.name)

    if (progressState.convertEnabled) {
      applyProgress(job, progressState, {
        message: 'Converting to FLAC',
        currentTrack: null,
      })
      const conv = await convertDirToFlac(albumPath, {
        onProgress: ({ index, total }) => {
          if (total > 0) {
            progressState.convertTotal = total
          }
          progressState.convertDone = Math.max(
            progressState.convertDone,
            Math.min(progressState.convertTotal || index, index),
          )
          applyProgress(job, progressState, {
            message: `Converting to FLAC (${index}/${progressState.convertTotal || total || index})`,
          })
        },
      })
      job.stats.converted = conv.converted
      job.stats.flacFailed = conv.failed
      if (conv.total > 0) {
        progressState.convertTotal = conv.total
        progressState.convertDone = Math.max(progressState.convertDone, conv.total)
      }
      progressState.convertDone = Math.max(
        progressState.convertDone,
        progressState.convertTotal,
      )
      applyProgress(job, progressState, {
        message: 'Converting to FLAC',
      })
    }

    if (!isSong) {
      progressState.finalizeProgress = Math.max(progressState.finalizeProgress, 0.35)
      applyProgress(job, progressState, {
        message: 'Extracting cover art',
        currentTrack: null,
      })
      await extractFolderArt(albumPath, { size: 1000 }).catch(() => null)
    }

    const finalFiles = await fsp.readdir(albumPath)
    const audioCount = finalFiles.filter((f) =>
      /\.(flac|m4a|mp3)$/i.test(f),
    ).length
    if (audioCount === 0) throw new Error('no audio files in final folder')

    let finalDir
    if (isSong) {
      const artistDir = await resolveArtistDir(MUSIC_ROOT, firstArtist.name)
      const singlesDir = path.join(MUSIC_ROOT, artistDir, 'Singles')
      await ensureDir(singlesDir)
      const flacName = finalFiles.find((f) => /\.flac$/i.test(f))
      const srcName = flacName || finalFiles.find((f) => /\.(m4a|mp3)$/i.test(f))
      if (!srcName) throw new Error('no audio file to move')
      const ext = path.extname(srcName)
      const targetName = sanitizeSegment(job.albumTitle) + ext
      const srcPath = path.join(albumPath, srcName)
      const destPath = path.join(singlesDir, targetName)
      progressState.finalizeProgress = Math.max(progressState.finalizeProgress, 0.7)
      applyProgress(job, progressState, {
        message: 'Moving into library',
        currentTrack: null,
      })
      await moveFileSafe(srcPath, destPath)

      const srcBase = path.basename(srcName, path.extname(srcName))
      const destBase = path.basename(targetName, path.extname(targetName))
      const srcLrcPath = path.join(albumPath, `${srcBase}.lrc`)
      const destLrcPath = path.join(singlesDir, `${destBase}.lrc`)
      const hasLrc = await fsp
        .stat(srcLrcPath)
        .then((s) => s.isFile())
        .catch(() => false)
      if (hasLrc) {
        await moveFileSafe(srcLrcPath, destLrcPath)
      }
      finalDir = singlesDir
    } else {
      finalDir = await computeFinalDir(
        MUSIC_ROOT,
        firstArtist.name,
        firstAlbum.name.replace(/\s*\(\d{4}\)\s*$/, ''),
        job.year,
      )
      progressState.finalizeProgress = Math.max(progressState.finalizeProgress, 0.75)
      applyProgress(job, progressState, {
        message: 'Moving into library',
        currentTrack: null,
      })
      await mergeMove(albumPath, finalDir)
    }

    try {
      await fsp.rm(albumPath, { recursive: true, force: true })
      await fsp.rmdir(artistPath)
      await fsp.rmdir(jobStaging)
    } catch {
      /* ignore */
    }

    progressState.finalizeProgress = 1
    applyProgress(job, progressState, {
      message: 'Finalizing import',
      currentTrack: null,
    })

    updateJob(job.id, {
      status: 'done',
      progress: 100,
      message: isSong ? 'Imported track' : `Imported ${audioCount} tracks`,
      finalDir,
    })
    await appendHistory(job)
  } catch (err) {
    state.running.delete(job.id)
    if (err.name === 'AbortError') {
      updateJob(job.id, {
        status: 'failed',
        error: 'Cancelled',
        message: 'Cancelled',
      })
    } else {
      console.error(`[job ${job.id}] failed:`, err)
      updateJob(job.id, {
        status: 'failed',
        error: err.message,
        message: `Failed: ${err.message}`,
      })
    }
    await appendHistory(job).catch(() => {})
  }
}

// amdp emits lines like:
//   "Track 1 of 12:"          (album/song — primary format)
//   "Track 1 of 12: songs"    (playlist/station — with type suffix)
//   "[1/12] Song Name"        (legacy fallback)
//   "Downloading X/Y: Song"   (legacy fallback)
//   progress-bar lines with percentages (schollz/progressbar, uses \r)
function handleAmdpLine(job, line, which, progressState) {
  let matchedTrackHeader = false

  const trackHeader = line.match(/^Track\s+(\d+)\s+of\s+(\d+)\s*:?\s*(.*)$/i)
  if (trackHeader) {
    const current = Number(trackHeader[1])
    const total = Number(trackHeader[2])
    if (total > 0) {
      matchedTrackHeader = true
      progressState.downloadTotal = total
      const inferredDone = Math.max(0, Math.min(total, current - 1))
      if (inferredDone > progressState.downloadDone) {
        progressState.downloadDone = inferredDone
      }
      progressState.downloadPartial = 0
      if (progressState.convertEnabled && progressState.convertDone === 0) {
        progressState.convertTotal = total
      }

      job.stats.total = total
      job.stats.done = Math.max(job.stats.done || 0, inferredDone)

      const title = String(trackHeader[3] || '').trim()
      applyProgress(job, progressState, {
        currentTrack:
          title && !/^(songs|music-videos)$/i.test(title)
            ? title
            : job.currentTrack,
      })
    }
  }

  if (!matchedTrackHeader) {
    const bracketed = line.match(/\[(\d+)\/(\d+)\]/)
    if (bracketed) {
      const done = Number(bracketed[1])
      const total = Number(bracketed[2])
      if (total > 0) {
        matchedTrackHeader = true
        progressState.downloadTotal = total
        progressState.downloadDone = Math.max(
          progressState.downloadDone,
          Math.min(total, Math.max(0, done)),
        )
        progressState.downloadPartial = 0
        if (progressState.convertEnabled && progressState.convertDone === 0) {
          progressState.convertTotal = total
        }

        job.stats.total = total
        job.stats.done = Math.max(job.stats.done || 0, Math.min(total, done))

        applyProgress(job, progressState, {
          currentTrack: extractBracketTitle(line),
        })
      }
    }
  }

  if (!matchedTrackHeader) {
    const downloading = line.match(
      /Downloading\s+(\d+)\s*\/\s*(\d+)\s*:\s*(.+)$/i,
    )
    if (downloading) {
      const current = Number(downloading[1])
      const total = Number(downloading[2])
      if (total > 0) {
        matchedTrackHeader = true
        progressState.downloadTotal = total
        const inferredDone = Math.max(0, Math.min(total, current - 1))
        if (inferredDone > progressState.downloadDone) {
          progressState.downloadDone = inferredDone
          progressState.downloadPartial = 0
        }
        if (progressState.convertEnabled && progressState.convertDone === 0) {
          progressState.convertTotal = total
        }

        job.stats.total = total
        job.stats.done = Math.max(job.stats.done || 0, inferredDone)

        applyProgress(job, progressState, {
          currentTrack: String(downloading[3] || '').trim() || job.currentTrack,
        })
      }
    }
  }

  // Progress-bar percentage drives in-track partial. A new track header
  // resets downloadPartial so each track's bar advances the shared total.
  if (!matchedTrackHeader) {
    const pctMatch = line.match(/(\d{1,3})\s*%/)
    if (pctMatch) {
      const pct = Math.max(0, Math.min(100, Number(pctMatch[1])))
      if (progressState.downloadDone < progressState.downloadTotal) {
        const partial = pct / 100
        if (partial > progressState.downloadPartial) {
          progressState.downloadPartial = partial
          applyProgress(job, progressState)
        }
      }
    }
  }

  if (which === 'stderr' && /error|failed|forbidden/i.test(line)) {
    job.stats.failed = (job.stats.failed || 0) + 1
  }

  emitEvent('job.log', { id: job.id, line, which })
}

function extractBracketTitle(line) {
  const m = line.match(/\]\s*(.+?)(?:\s*\[|$)/)
  return m ? m[1].trim() : null
}

function probeMp4Box() {
  try {
    const r = spawnSync('MP4Box', ['-version'], {
      encoding: 'utf8',
      timeout: 2500,
    })
    const out = `${r.stdout || ''}\n${r.stderr || ''}`
    if (r.status === 0 && /GPAC version/i.test(out)) {
      return { ok: true, error: null }
    }
    if (r.error?.code === 'ENOENT') {
      return { ok: false, error: 'executable not found in PATH' }
    }
    return {
      ok: false,
      error: `exit ${r.status ?? 'unknown'}${r.signal ? ` (${r.signal})` : ''}`,
    }
  } catch (err) {
    return { ok: false, error: err.message || 'unknown preflight error' }
  }
}

function detectAmdpRemuxError(output) {
  if (!output) return null
  const lines = String(output)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const patterns = [
    /Embed failed:/i,
    /exec:\s*"MP4Box":\s*executable file not found/i,
    /MP4Box.*not found/i,
    /MP4Box.*No such file/i,
    /remux.*failed/i,
  ]

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (patterns.some((re) => re.test(line))) {
      return `amdp remux/embed failed: ${line.slice(0, 260)}`
    }
  }
  return null
}

async function importPlaylistTracks({ job, jobStaging, onProgress }) {
  const candidates = await collectAudioFiles(jobStaging)
  const imported = []

  for (let i = 0; i < candidates.length; i++) {
    const srcPath = candidates[i].path
    const relParts = path
      .relative(jobStaging, srcPath)
      .split(path.sep)
      .filter(Boolean)
    const parsed = inferArtistAlbumFromPath(relParts)
    const tags = await probeAudioTags(srcPath)

    const artistName = tags.artist || parsed.artist || job.artist || 'Unknown Artist'
    const albumName = tags.album || parsed.album || null

    let destDir
    let targetName = path.basename(srcPath)
    if (albumName) {
      destDir = await computeFinalDir(
        MUSIC_ROOT,
        artistName,
        stripTrailingYear(albumName),
        null,
      )
    } else {
      const artistDir = await resolveArtistDir(MUSIC_ROOT, artistName)
      destDir = path.join(MUSIC_ROOT, artistDir, 'Singles')
      const title = sanitizeSegment(tags.title || path.basename(srcPath, path.extname(srcPath)))
      targetName = `${title}${path.extname(srcPath)}`
    }
    await ensureDir(destDir)

    const destPath = path.join(destDir, targetName)
    await moveFileSafe(srcPath, destPath)
    await moveLyricsSidecars(srcPath, destPath)
    await copyFolderArtIfAny(path.dirname(srcPath), destDir)

    imported.push(destPath)
    onProgress?.({ done: i + 1, total: candidates.length })
  }

  return imported
}

async function collectAudioFiles(root) {
  const out = []
  await walk(root)
  out.sort((a, b) => (a.mtimeMs - b.mtimeMs) || a.path.localeCompare(b.path))
  return out

  async function walk(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (/\.(flac|m4a|mp3)$/i.test(entry.name)) {
        const stat = await fsp.stat(abs).catch(() => null)
        out.push({ path: abs, mtimeMs: stat?.mtimeMs || 0 })
      }
    }
  }
}

function inferArtistAlbumFromPath(parts) {
  if (parts.length >= 3) {
    return {
      artist: parts[0],
      album: parts[1],
    }
  }
  if (parts.length >= 2) {
    return {
      artist: parts[0],
      album: null,
    }
  }
  return { artist: null, album: null }
}

async function probeAudioTags(filePath) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format_tags=artist,album,title',
      '-of',
      'json',
      filePath,
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
    },
  )
  if (result.status !== 0 || !result.stdout) {
    return { artist: null, album: null, title: null }
  }
  try {
    const parsed = JSON.parse(result.stdout)
    const tags = parsed?.format?.tags || {}
    return {
      artist: cleanTag(tags.artist),
      album: cleanTag(tags.album),
      title: cleanTag(tags.title),
    }
  } catch {
    return { artist: null, album: null, title: null }
  }
}

function cleanTag(value) {
  if (typeof value !== 'string') return null
  const s = value.trim()
  return s ? s : null
}

async function moveLyricsSidecars(srcAudioPath, destAudioPath) {
  const srcBase = path.basename(srcAudioPath, path.extname(srcAudioPath))
  const destBase = path.basename(destAudioPath, path.extname(destAudioPath))
  const srcDir = path.dirname(srcAudioPath)
  const destDir = path.dirname(destAudioPath)
  for (const ext of ['.lrc', '.ttml']) {
    const src = path.join(srcDir, `${srcBase}${ext}`)
    const has = await fsp
      .stat(src)
      .then((s) => s.isFile())
      .catch(() => false)
    if (!has) continue
    const dest = path.join(destDir, `${destBase}${ext}`)
    await moveFileSafe(src, dest)
  }
}

async function copyFolderArtIfAny(srcDir, destDir) {
  const src = path.join(srcDir, 'folder.jpg')
  const exists = await fsp
    .stat(src)
    .then((s) => s.isFile())
    .catch(() => false)
  if (!exists) return
  const dest = path.join(destDir, 'folder.jpg')
  const destExists = await fsp
    .stat(dest)
    .then((s) => s.isFile())
    .catch(() => false)
  if (destExists) return
  await fsp.copyFile(src, dest).catch(() => {})
}

async function writePlaylistM3U({ playlistName, playlistId, tracks }) {
  const playlistsDir = path.join(MUSIC_ROOT, 'Playlists')
  await ensureDir(playlistsDir)
  const base = sanitizeSegment(playlistName || 'Playlist')
  const filePath = path.join(playlistsDir, `${base}.m3u8`)

  const lines = ['#EXTM3U', `#PLAYLIST:${playlistName || 'Playlist'}`]
  if (playlistId) {
    lines.push(`#ALACARTE_PLAYLIST_ID:${playlistId}`)
  }
  for (const absPath of tracks) {
    const rel = path
      .relative(playlistsDir, absPath)
      .split(path.sep)
      .join('/')
    lines.push(rel)
  }
  await fsp.writeFile(filePath, `${lines.join('\n')}\n`, { mode: 0o664 })
  return filePath
}

async function moveFileSafe(from, to) {
  try {
    await fsp.rename(from, to)
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fsp.copyFile(from, to)
      await fsp.unlink(from).catch(() => {})
    } else if (err.code === 'EEXIST') {
      await fsp.rm(to).catch(() => {})
      await fsp.rename(from, to)
    } else {
      throw err
    }
  }
}
