import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api, type Album, type Artist } from '../api/client'
import { stripYear } from '../lib/format'

type Props = {
  kind: 'artist' | 'album'
  artistId?: string | null
  albumId?: string | null
  artistName?: string | null
  albumName?: string | null
  className?: string
  children: ReactNode
}

const resolvedPathCache = new Map<string, string | null>()
const pendingResolutionCache = new Map<string, Promise<string | null>>()

export function ResolvedMediaLink({
  kind,
  artistId,
  albumId,
  artistName,
  albumName,
  className,
  children,
}: Props) {
  const navigate = useNavigate()
  const directPath = useMemo(() => {
    if (kind === 'artist' && artistId) return `/artist/${artistId}`
    if (kind === 'album' && albumId) return `/album/${albumId}`
    return null
  }, [albumId, artistId, kind])

  const cacheKey = useMemo(
    () =>
      buildCacheKey({
        kind,
        artistId,
        albumId,
        artistName,
        albumName,
      }),
    [albumId, albumName, artistId, artistName, kind],
  )

  const fallbackPath = useMemo(() => {
    const query =
      kind === 'artist'
        ? String(artistName || '').trim()
        : [String(artistName || '').trim(), stripYear(String(albumName || '').trim())]
            .filter(Boolean)
            .join(' ')
    if (!query) return null
    return `/search?q=${encodeURIComponent(query)}`
  }, [albumName, artistName, kind])

  const [resolvedPath, setResolvedPath] = useState<string | null>(() => {
    if (directPath) return directPath
    if (!cacheKey) return null
    return resolvedPathCache.get(cacheKey) ?? null
  })

  useEffect(() => {
    if (directPath) {
      setResolvedPath(directPath)
      return
    }
    if (!cacheKey) {
      setResolvedPath(null)
      return
    }
    setResolvedPath(resolvedPathCache.get(cacheKey) ?? null)
  }, [cacheKey, directPath])

  const resolvePath = useCallback(async () => {
    if (directPath) return directPath
    if (!cacheKey) return null

    if (resolvedPathCache.has(cacheKey)) {
      const cached = resolvedPathCache.get(cacheKey) ?? null
      if (cached) setResolvedPath(cached)
      return cached
    }

    const pending = pendingResolutionCache.get(cacheKey)
    if (pending) {
      const result = await pending
      if (result) setResolvedPath(result)
      return result
    }

    const promise = resolveEntityPath({
      kind,
      artistName,
      albumName,
      artistId,
      albumId,
    })
      .then((result) => {
        resolvedPathCache.set(cacheKey, result)
        pendingResolutionCache.delete(cacheKey)
        if (result) setResolvedPath(result)
        return result
      })
      .catch(() => {
        resolvedPathCache.set(cacheKey, null)
        pendingResolutionCache.delete(cacheKey)
        return null
      })

    pendingResolutionCache.set(cacheKey, promise)
    return promise
  }, [albumId, albumName, artistId, artistName, cacheKey, directPath, kind])

  const prewarm = useCallback(() => {
    if (!resolvedPath && !directPath) void resolvePath()
  }, [directPath, resolvePath, resolvedPath])

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLAnchorElement>) => {
      if (directPath || resolvedPath || !fallbackPath) return
      e.preventDefault()
      const target = await resolvePath()
      navigate(target || fallbackPath)
    },
    [directPath, fallbackPath, navigate, resolvePath, resolvedPath],
  )

  const to = resolvedPath || directPath || fallbackPath || '#'

  if (!directPath && !resolvedPath && !fallbackPath) {
    return <span className={className}>{children}</span>
  }

  return (
    <Link
      to={to}
      className={className}
      onClick={handleClick}
      onMouseEnter={prewarm}
      onFocus={prewarm}
      onTouchStart={prewarm}
    >
      {children}
    </Link>
  )
}

function buildCacheKey({
  kind,
  artistId,
  albumId,
  artistName,
  albumName,
}: Omit<Props, 'children' | 'className'>) {
  if (kind === 'artist' && artistId) return `artist-id::${artistId}`
  if (kind === 'album' && albumId) return `album-id::${albumId}`
  if (kind === 'artist') {
    const normalizedArtist = normalizeArtistName(artistName)
    return normalizedArtist ? `artist-name::${normalizedArtist}` : ''
  }
  const normalizedArtist = normalizeArtistName(artistName)
  const normalizedAlbum = normalizeAlbumName(albumName)
  if (!normalizedAlbum) return ''
  return `album-name::${normalizedArtist}::${normalizedAlbum}`
}

async function resolveEntityPath({
  kind,
  artistName,
  albumName,
  artistId,
  albumId,
}: Omit<Props, 'children' | 'className'>) {
  if (kind === 'artist' && artistId) return `/artist/${artistId}`
  if (kind === 'album' && albumId) return `/album/${albumId}`

  if (kind === 'artist') {
    const resolvedArtistId = await resolveArtistId(artistName)
    return resolvedArtistId ? `/artist/${resolvedArtistId}` : null
  }

  const resolvedAlbumId = await resolveAlbumId({ artistName, albumName })
  return resolvedAlbumId ? `/album/${resolvedAlbumId}` : null
}

async function resolveArtistId(artistName?: string | null) {
  const name = String(artistName || '').trim()
  if (!name) return null
  const result = await api.search(name, { types: 'artists', limit: 10 })
  return pickBestArtistId(name, result.artists)
}

async function resolveAlbumId({
  artistName,
  albumName,
}: {
  artistName?: string | null
  albumName?: string | null
}) {
  const resolvedAlbumName = stripYear(String(albumName || '').trim())
  const resolvedArtistName = String(artistName || '').trim()
  if (!resolvedAlbumName) return null

  const queries = [
    [resolvedArtistName, resolvedAlbumName].filter(Boolean).join(' '),
    resolvedAlbumName,
  ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)

  let candidates: Album[] = []
  for (const query of queries) {
    const result = await api.search(query, { types: 'albums', limit: 10 })
    candidates = [...candidates, ...result.albums]
    const exact = pickBestAlbumId(
      { artistName: resolvedArtistName, albumName: resolvedAlbumName },
      candidates,
    )
    if (exact) return exact
  }

  return null
}

function pickBestArtistId(targetName: string, candidates: Artist[]) {
  const targetNorm = normalizeArtistName(targetName)
  const targetLower = String(targetName || '').toLowerCase().trim()
  const targetTokens = tokenize(targetName)
  if (!targetNorm) return null

  const scored = candidates
    .map((candidate) => {
      const name = String(candidate?.name || '').trim()
      const id = String(candidate?.id || '').trim()
      if (!name || !id) return null

      const norm = normalizeArtistName(name)
      const lower = name.toLowerCase()
      const tokens = tokenize(name)
      let score = 0

      if (norm === targetNorm) score += 100
      if (lower === targetLower) score += 20
      if (norm.startsWith(targetNorm) || targetNorm.startsWith(norm)) score += 25
      if (lower.includes(targetLower) || targetLower.includes(lower)) score += 12
      if (targetTokens.length > 0) score += tokenOverlap(targetTokens, tokens) * 35

      return { id, score }
    })
    .filter((value): value is { id: string; score: number } => Boolean(value))
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  const best = scored[0]
  const second = scored[1]
  if (best.score < 80) return null
  if (second && best.score - second.score < 10) return null
  return best.id
}

function pickBestAlbumId(
  target: { artistName?: string | null; albumName: string },
  candidates: Album[],
) {
  const targetAlbumNorm = normalizeAlbumName(target.albumName)
  const targetArtistNorm = normalizeArtistName(target.artistName)
  const targetAlbumLower = stripYear(target.albumName).toLowerCase().trim()
  const targetArtistLower = String(target.artistName || '').toLowerCase().trim()
  const targetAlbumTokens = tokenize(target.albumName)
  const targetArtistTokens = tokenize(target.artistName)
  if (!targetAlbumNorm) return null

  const deduped = new Map<string, Album>()
  for (const candidate of candidates) {
    if (!candidate?.id || deduped.has(candidate.id)) continue
    deduped.set(candidate.id, candidate)
  }

  const scored = [...deduped.values()]
    .map((candidate) => {
      const candidateAlbum = String(candidate.name || '').trim()
      const candidateArtist = String(candidate.artistName || '').trim()
      const candidateId = String(candidate.id || '').trim()
      if (!candidateAlbum || !candidateId) return null

      const albumNorm = normalizeAlbumName(candidateAlbum)
      const artistNorm = normalizeArtistName(candidateArtist)
      const albumLower = stripYear(candidateAlbum).toLowerCase().trim()
      const artistLower = candidateArtist.toLowerCase().trim()
      const albumTokens = tokenize(candidateAlbum)
      const artistTokens = tokenize(candidateArtist)
      let score = 0

      if (albumNorm === targetAlbumNorm) score += 120
      if (albumLower === targetAlbumLower) score += 30
      if (
        albumNorm.startsWith(targetAlbumNorm) ||
        targetAlbumNorm.startsWith(albumNorm)
      ) {
        score += 18
      }
      if (targetAlbumTokens.length > 0) {
        score += tokenOverlap(targetAlbumTokens, albumTokens) * 30
      }

      if (targetArtistNorm) {
        if (artistNorm === targetArtistNorm) score += 120
        if (artistLower === targetArtistLower) score += 24
        if (
          artistNorm.startsWith(targetArtistNorm) ||
          targetArtistNorm.startsWith(artistNorm)
        ) {
          score += 20
        }
        if (targetArtistTokens.length > 0) {
          score += tokenOverlap(targetArtistTokens, artistTokens) * 30
        }
      }

      return { id: candidateId, score }
    })
    .filter((value): value is { id: string; score: number } => Boolean(value))
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  const best = scored[0]
  const second = scored[1]
  if (best.score < (targetArtistNorm ? 180 : 120)) return null
  if (second && best.score - second.score < 12) return null
  return best.id
}

function normalizeArtistName(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeAlbumName(value?: string | null) {
  return normalizeArtistName(stripYear(String(value || '')))
}

function tokenize(value?: string | null) {
  return normalizeArtistName(value)
    .split(' ')
    .filter(Boolean)
}

function tokenOverlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0
  const bSet = new Set(b)
  const shared = a.filter((token) => bSet.has(token)).length
  return shared / Math.max(a.length, b.length)
}
