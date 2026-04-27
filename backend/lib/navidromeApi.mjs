import crypto from 'node:crypto'
import { readNavidromeCreds } from './settingsStore.mjs'

export async function triggerNavidromeScan() {
  const creds = await readNavidromeCreds()
  if (!creds.enabled || !creds.url || !creds.user || !creds.password) {
    return
  }

  try {
    const salt = crypto.randomBytes(6).toString('hex')
    const token = crypto.createHash('md5').update(creds.password + salt).digest('hex')
    
    const url = new URL('/rest/startScan', creds.url)
    url.searchParams.set('u', creds.user)
    url.searchParams.set('t', token)
    url.searchParams.set('s', salt)
    url.searchParams.set('v', '1.16.1')
    url.searchParams.set('c', 'alacarte')
    url.searchParams.set('f', 'json')

    const response = await fetch(url.toString(), {
      method: 'GET'
    })

    if (!response.ok) {
      console.error(`Navidrome API error: ${response.status} ${response.statusText}`)
      return
    }

    const data = await response.json()
    if (data['subsonic-response'] && data['subsonic-response'].status === 'failed') {
      console.error('Navidrome API failed:', data['subsonic-response'].error)
    } else {
      console.log('Successfully triggered Navidrome scan.')
    }
  } catch (err) {
    console.error('Failed to trigger Navidrome scan:', err.message)
  }
}
