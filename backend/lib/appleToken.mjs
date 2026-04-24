let cached = { token: null, expiresAt: 0 }
const TTL_MS = 25 * 60 * 1000
export async function getBearerToken() {
  const now = Date.now()
  if (cached.token && cached.expiresAt > now) return cached.token

  const rootRes = await fetch('https://music.apple.com', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  })
  if (!rootRes.ok) throw new Error(`music.apple.com returned ${rootRes.status}`)
  const html = await rootRes.text()
  const m = html.match(/\/assets\/index~[^"']+\.js/)
  if (!m) throw new Error('could not locate index~*.js bundle URL')

  const jsRes = await fetch('https://music.apple.com' + m[0])
  if (!jsRes.ok) throw new Error(`bundle returned ${jsRes.status}`)
  const js = await jsRes.text()
  const tokenMatch = js.match(/eyJh[A-Za-z0-9_\-\.]+/)
  if (!tokenMatch) throw new Error('no JWT token found in bundle')

  cached = { token: tokenMatch[0], expiresAt: now + TTL_MS }
  return cached.token
}

export function invalidateBearerCache() {
  cached = { token: null, expiresAt: 0 }
}
