import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

import { healthRouter } from './routes/health.mjs'
import { settingsRouter } from './routes/settings.mjs'
import { searchRouter } from './routes/search.mjs'
import { albumRouter } from './routes/album.mjs'
import { artistRouter } from './routes/artist.mjs'
import { downloadRouter } from './routes/download.mjs'
import { queueRouter } from './routes/queue.mjs'
import { eventsRouter } from './routes/events.mjs'
import { libraryRouter } from './routes/library.mjs'
import { ensureConfigDir } from './lib/settingsStore.mjs'

const PORT = Number(process.env.PORT || 7373)
const CONFIG_DIR = process.env.AMDL_CONFIG_DIR || '/config'
const MUSIC_PATH = process.env.AMDL_MUSIC_PATH || '/music'

await ensureConfigDir(CONFIG_DIR)

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

app.use((req, _res, next) => {
  const stamp = new Date().toISOString()
  if (!req.path.startsWith('/api/events')) {
    console.log(`[${stamp}] ${req.method} ${req.path}`)
  }
  next()
})

app.use('/api/health', healthRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/search', searchRouter)
app.use('/api/album', albumRouter)
app.use('/api/artist', artistRouter)
app.use('/api/download', downloadRouter)
app.use('/api/queue', queueRouter)
app.use('/api/events', eventsRouter)
app.use('/api/library', libraryRouter)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, 'public')
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('alacarte backend running (frontend not bundled)')
  })
}

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: String(err?.message || err) })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `alacarte listening on :${PORT} (music=${MUSIC_PATH} config=${CONFIG_DIR})`,
  )
})
