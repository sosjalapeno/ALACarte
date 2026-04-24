import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`))
    })
    proc.on('error', reject)
  })
}

export async function convertToFlac(inputPath, { deleteOriginal = true } = {}) {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  const outPath = path.join(dir, `${base}.flac`)
  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-map',
    '0',
    '-map_metadata',
    '0',
    '-c:a',
    'flac',
    '-compression_level',
    '8',
    '-c:v',
    'copy',
    '-disposition:v:0',
    'attached_pic',
    '-metadata',
    'encoder=FLAC',
    outPath,
  ])
  if (deleteOriginal) {
    try {
      await fsp.unlink(inputPath)
    } catch {}
  }
  return outPath
}

async function collectInputFiles(dir) {
  const out = []
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await collectInputFiles(p)))
    } else {
      const ext = path.extname(e.name).toLowerCase()
      if (ext === '.m4a' || ext === '.alac') out.push(p)
    }
  }
  return out
}

export async function convertDirToFlac(dir, opts = {}) {
  const { onProgress, ...convertOpts } = opts
  const files = await collectInputFiles(dir)
  const total = files.length
  let converted = 0
  let failed = 0
  for (let i = 0; i < files.length; i++) {
    const p = files[i]
    try {
      await convertToFlac(p, convertOpts)
      converted++
    } catch (err) {
      console.error(`FLAC convert failed for ${p}: ${err.message}`)
      failed++
    }
    if (typeof onProgress === 'function') {
      try {
        onProgress({ file: p, index: i + 1, total })
      } catch {}
    }
  }
  return { converted, failed, total }
}

export async function extractFolderArt(dir, { size = 1000 } = {}) {
  const target = path.join(dir, 'folder.jpg')
  if (fs.existsSync(target)) return target
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const audio = entries.find(
    (e) => e.isFile() && /\.(flac|m4a|mp3)$/i.test(e.name),
  )
  if (!audio) return null
  const input = path.join(dir, audio.name)
  try {
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-an',
      '-vcodec',
      'mjpeg',
      '-vf',
      `scale='min(${size},iw)':-1`,
      target,
    ])
    return fs.existsSync(target) ? target : null
  } catch (err) {
    console.error(`folder.jpg extraction failed: ${err.message}`)
    return null
  }
}

