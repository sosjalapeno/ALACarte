export type Album = {
  id: string
  name: string
  artistName: string
  artistId?: string | null
  releaseDate?: string | null
  year?: string | null
  trackCount?: number
  isSingle?: boolean
  contentRating?: string
  artworkTemplate: string | null
  artworkColor?: string | null
  url?: string
}

export type Artist = {
  id: string
  name: string
  genreNames?: string[]
  url?: string
}

export type Song = {
  id: string
  name: string
  artistName: string
  artistId?: string | null
  albumName?: string
  albumId?: string | null
  durationMs?: number
  artworkTemplate: string | null
}

export type Playlist = {
  id: string
  name: string
  curatorName: string
  curatorId?: string | null
  trackCount?: number
  artworkTemplate: string | null
  artworkColor?: string | null
  url?: string
  description?: string
}

export type PlaylistTrack = {
  id: string
  name: string
  trackNumber?: number
  durationMs?: number
  artistName: string
  artistId?: string | null
  albumName?: string
  artworkTemplate?: string | null
  hasLossless?: boolean
  hasHiRes?: boolean
  hasAtmos?: boolean
}

export type PlaylistDetail = Playlist & {
  hasLossless: boolean
  hasHiRes: boolean
  hasAtmos: boolean
  lastModifiedDate?: string
  tracks: PlaylistTrack[]
}

export type AlbumTrack = {
  id: string
  name: string
  trackNumber?: number
  discNumber?: number
  durationMs?: number
  artistName: string
  hasLossless?: boolean
  hasHiRes?: boolean
  hasAtmos?: boolean
}

export type AlbumDetail = Album & {
  genreNames: string[]
  artists?: Array<{ id: string; name?: string }>
  recordLabel?: string
  copyright?: string
  upc?: string
  hasLossless: boolean
  hasHiRes: boolean
  hasAtmos: boolean
  tracks: AlbumTrack[]
}

export type Job = {
  id: string
  kind: 'album' | 'song' | 'playlist'
  status: 'queued' | 'running' | 'done' | 'failed'
  progress: number
  albumId: string
  songId?: string | null
  playlistId?: string | null
  albumTitle: string
  artist: string
  artistId?: string | null
  artworkUrl?: string
  currentTrack?: string | null
  message?: string
  error?: string | null
  createdAt: number
  updatedAt: number
  finalDir?: string
  stats?: { total?: number; done?: number; failed?: number; converted?: number }
}

export type QualityPreference = 'flac' | 'alac' | 'atmos' | 'aac'

export type HealthReport = {
  ok: boolean
  wrapper: {
    host: string
    decrypt: { ok: boolean; error: string | null }
    m3u8: { ok: boolean; error: string | null }
    account: { ok: boolean; error: string | null }
  }
  appleToken: { ok: boolean; error: string | null }
  music: { path: string; ok: boolean; error?: string }
}

export type PublicSettings = {
  storefront: string
  language: string
  quality: QualityPreference
  albumFolderFormat: string
  artistFolderFormat: string
  songFileFormat: string
  convertToFlac: boolean
  keepAlac: boolean
  coverSize: string
  downloadLyrics: boolean
  lyricsFormat: 'lrc' | 'ttml'
  lyricsType: 'lyrics' | 'lyrics-with-translation'
  explicitFilter: 'explicit' | 'clean' | 'both'
  appleEmailMasked: string | null
  hasAppleCreds: boolean
  hasMediaUserToken: boolean
  hardBlockReason?: string | null
}

export type LibrarySingle = {
  id: string
  artistName: string
  artistId?: string | null
  songName: string
  relPath: string
  hasLyrics: boolean
  addedAt?: number
}

export type SearchOptions = {
  types?: string
  limit?: number
  offset?: number
}

export type LibraryAlbum = {
  id: string
  artistName: string
  artistId?: string | null
  albumName: string
  relPath: string
  trackCount: number
  lyricsCount: number
  hasLyrics: boolean
  addedAt?: number
}

type UnauthorizedHandler = (info: { needsSetup: boolean }) => void

let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler
}

export class HttpError extends Error {
  status: number
  needsSetup: boolean
  retryAfter: number | null
  lockedUntil: number | null
  constructor(
    status: number,
    message: string,
    needsSetup = false,
    retryAfter: number | null = null,
    lockedUntil: number | null = null,
  ) {
    super(message)
    this.status = status
    this.needsSetup = needsSetup
    this.retryAfter = retryAfter
    this.lockedUntil = lockedUntil
  }
}

let setupToken: string | null = null

export function setSetupToken(token: string | null) {
  setupToken = token && token.trim() ? token.trim() : null
}

async function http<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) {
    if (res.status === 401) {
      const needsSetup = Boolean(body?.needsSetup)
      // Don't trip the auth overlay for the auth endpoints themselves —
      // login/setup pages handle their own errors inline.
      if (!path.startsWith('/api/auth/') && onUnauthorized) {
        onUnauthorized({ needsSetup })
      }
      throw new HttpError(401, body?.error || 'unauthorized', needsSetup)
    }
    const msg = body?.error || `HTTP ${res.status}`
    throw new HttpError(
      res.status,
      msg,
      false,
      typeof body?.retryAfter === 'number' ? body.retryAfter : null,
      typeof body?.lockedUntil === 'number' ? body.lockedUntil : null,
    )
  }
  return body as T
}

export type AuthState = {
  authDisabled: boolean
  passwordSet: boolean
  authed: boolean
  username: string | null
  minPasswordLength: number
  usernameMinLength: number
  usernameMaxLength: number
  requiresSetupToken?: boolean
}

export type WrapperLoginStatus =
  | { inProgress: false }
  | {
      inProgress: true
      status: {
        phase: string
        error?: string
        tail?: string[]
      }
    }

export const api = {
  authState: () => http<AuthState>('/api/auth/state'),
  authSetup: (username: string, password: string) =>
    http<{ ok: boolean; username: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: setupToken ? { 'X-Setup-Token': setupToken } : undefined,
    }),
  authLogin: (username: string, password: string) =>
    http<{ ok: boolean; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  authLogout: () =>
    http<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  authChangePassword: (currentPassword: string, newPassword: string) =>
    http<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  authChangeUsername: (currentPassword: string, username: string) =>
    http<{ ok: boolean; username: string }>('/api/auth/change-username', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, username }),
    }),
  authRevokeAll: (currentPassword: string) =>
    http<{ ok: boolean }>('/api/auth/revoke-all', {
      method: 'POST',
      body: JSON.stringify({ currentPassword }),
    }),
  health: () => http<HealthReport>('/api/health'),
  settings: () => http<PublicSettings>('/api/settings'),
  saveSettings: (patch: Partial<PublicSettings>) =>
    http<PublicSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  saveAppleCreds: (email: string, password: string, autoLogin = true) =>
    http<{
      ok: boolean
      loginStarted?: boolean
      loginError?: string
    }>('/api/settings/apple-credentials', {
      method: 'POST',
      body: JSON.stringify({ email, password, autoLogin }),
    }),
  runAppleLogin: () =>
    http<{ ok: boolean; loginStarted?: boolean }>(
      '/api/settings/apple-credentials/login',
      { method: 'POST' },
    ),
  appleLoginStatus: () =>
    http<WrapperLoginStatus>('/api/settings/apple-credentials/login-status'),
  submitAppleTwoFa: (code: string) =>
    http<{ ok: boolean }>('/api/settings/apple-credentials/2fa', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  cancelAppleLogin: () =>
    http<{ ok: boolean }>(
      '/api/settings/apple-credentials/cancel-login',
      { method: 'POST' },
    ),
  clearAppleCreds: () =>
    http<{ ok: boolean }>('/api/settings/apple-credentials', {
      method: 'DELETE',
    }),
  saveMediaUserToken: (token: string) =>
    http<{ ok: boolean }>('/api/settings/media-user-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  clearMediaUserToken: () =>
    http<{ ok: boolean }>('/api/settings/media-user-token', {
      method: 'DELETE',
    }),
  search: (q: string, options: SearchOptions = {}) => {
    const params = new URLSearchParams({ q })
    if (options.types) params.set('types', options.types)
    if (typeof options.limit === 'number') params.set('limit', String(options.limit))
    if (typeof options.offset === 'number') params.set('offset', String(options.offset))
    return http<{
      albums: Album[]
      artists: Artist[]
      songs: Song[]
      playlists: Playlist[]
      storefront: string
    }>(`/api/search?${params.toString()}`)
  },
  album: (id: string) =>
    http<{ album: AlbumDetail; storefront: string }>(
      `/api/album/${encodeURIComponent(id)}`,
    ),
  artist: (id: string) =>
    http<{
      artist: Artist
      albums: Album[]
      storefront: string
    }>(`/api/artist/${encodeURIComponent(id)}`),
  playlist: (id: string) =>
    http<{ playlist: PlaylistDetail; storefront: string }>(
      `/api/playlist/${encodeURIComponent(id)}`,
    ),
  queue: () => http<{ jobs: Job[] }>('/api/queue'),
  library: () =>
    http<{
      albums: LibraryAlbum[]
      singles: LibrarySingle[]
      totals: { albums: number; singles: number }
    }>('/api/library'),
  libraryPresence: (payload: {
    albums?: Array<{ id: string; artistName: string; albumName: string }>
    songs?: Array<{ id: string; artistName: string; songName: string }>
  }) =>
    http<{ albums: Record<string, boolean>; songs: Record<string, boolean> }>(
      '/api/library/presence',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  deleteLibrarySong: (relPath: string) =>
    http<{ ok: boolean; removedLyrics?: boolean }>('/api/library/song', {
      method: 'DELETE',
      body: JSON.stringify({ relPath }),
    }),
  deleteLibraryAlbum: (relPath: string) =>
    http<{ ok: boolean }>('/api/library/album', {
      method: 'DELETE',
      body: JSON.stringify({ relPath }),
    }),
  enqueue: (albumId: string, quality?: QualityPreference) =>
    http<{ job: Job }>('/api/download', {
      method: 'POST',
      body: JSON.stringify({ albumId, quality }),
    }),
  enqueueSong: (songId: string, albumId: string, storefront?: string) =>
    http<{ job: Job }>('/api/download/song', {
      method: 'POST',
      body: JSON.stringify({ songId, albumId, storefront }),
    }),
  enqueuePlaylist: (playlistId: string, storefront?: string, quality?: QualityPreference) =>
    http<{ job: Job }>('/api/download/playlist', {
      method: 'POST',
      body: JSON.stringify({ playlistId, storefront, quality }),
    }),
  cancel: (id: string) =>
    http<{ ok: boolean }>(`/api/download/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
}

export function artworkUrl(
  template: string | null | undefined,
  size = 600,
): string | null {
  if (!template) return null
  return template
    .replace('{w}', String(size))
    .replace('{h}', String(size))
    .replace('{f}', 'jpg')
}

export function artworkSrcSet(template: string | null | undefined): string {
  if (!template) return ''
  const base = template.replace('{f}', 'jpg')
  return [300, 600, 1200]
    .map((s) =>
      `${base.replace('{w}', String(s)).replace('{h}', String(s))} ${s}w`,
    )
    .join(', ')
}
