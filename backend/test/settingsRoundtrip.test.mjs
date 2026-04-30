import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'

const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'alacarte-cfg-'))
process.env.AMDL_CONFIG_DIR = tmpDir
process.env.AMDL_SECRET_KEY = crypto.randomBytes(32).toString('hex')

const { ensureConfigDir, readSettings, readPublicSettings, writeSettings, AUTO_DOWNLOAD_FREQUENCY_VALUES } = await import(
  '../lib/settingsStore.mjs'
)
await ensureConfigDir(tmpDir)

test('AUTO_DOWNLOAD_FREQUENCY_VALUES is exported and contains the full enum', () => {
  for (const v of ['auto', '1h', '6h', '12h', 'daily', 'weekly']) {
    assert.ok(AUTO_DOWNLOAD_FREQUENCY_VALUES.has(v), `missing ${v}`)
  }
  assert.ok(!AUTO_DOWNLOAD_FREQUENCY_VALUES.has('manual'), 'manual must be removed')
})

test('default autoDownloadCheckFrequency is "auto" on a fresh config', async () => {
  const s = await readSettings()
  assert.equal(s.autoDownloadCheckFrequency, 'auto')
})

test('promptForDownloadQuality defaults to false and is public', async () => {
  await writeSettings({ promptForDownloadQuality: false })
  const s = await readSettings()
  const pub = await readPublicSettings()
  assert.equal(s.promptForDownloadQuality, false)
  assert.equal(pub.promptForDownloadQuality, false)
})

test('writeSettings persists promptForDownloadQuality', async () => {
  await writeSettings({ promptForDownloadQuality: true })
  let s = await readSettings()
  let pub = await readPublicSettings()
  assert.equal(s.promptForDownloadQuality, true)
  assert.equal(pub.promptForDownloadQuality, true)
  await writeSettings({ promptForDownloadQuality: false })
  s = await readSettings()
  pub = await readPublicSettings()
  assert.equal(s.promptForDownloadQuality, false)
  assert.equal(pub.promptForDownloadQuality, false)
})

test('writeSettings persists every accepted frequency value (round trip)', async () => {
  for (const v of ['auto', '1h', '6h', '12h', 'daily', 'weekly']) {
    await writeSettings({ autoDownloadCheckFrequency: v })
    const s = await readSettings()
    assert.equal(s.autoDownloadCheckFrequency, v, `failed to persist ${v}`)
  }
})

test('writeSettings rejects (normalizes away) an unknown frequency value', async () => {
  await writeSettings({ autoDownloadCheckFrequency: 'manual' })
  const s = await readSettings()
  assert.equal(s.autoDownloadCheckFrequency, 'auto')
})
