import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  api,
  type Album,
  type LibraryAlbum,
  type LibrarySingle,
  type Song,
} from '../api/client'
import { stripYear } from '../lib/format'
import { useEventStream } from './useEventStream'

type AlbumLookup = Pick<Album, 'id' | 'artistName' | 'name'> & { albumName?: string | null }
type SongLookup = Pick<Song, 'id' | 'artistName' | 'name'> & { songName?: string | null }

type LibraryPresenceContextValue = {
  loading: boolean
  ready: boolean
  isAlbumInLibrary: (album: AlbumLookup | null | undefined) => boolean
  isSongInLibrary: (song: SongLookup | null | undefined) => boolean
  verifyAlbumPresence: (album: AlbumLookup | null | undefined, force?: boolean) => Promise<boolean>
  verifySongPresence: (song: SongLookup | null | undefined, force?: boolean) => Promise<boolean>
  refreshLibraryPresence: () => Promise<void>
}

type PresenceSnapshot = {
  albumKeys: Record<string, true>
  songKeys: Record<string, true>
}

const BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/g
const LibraryPresenceContext = createContext<LibraryPresenceContextValue | null>(null)

export function LibraryPresenceProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>({ albumKeys: {}, songKeys: {} })
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const requestIdRef = useRef(0)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSnapshot = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current
    if (!silent) setLoading(true)
    try {
      const r = await api.library()
      if (requestId !== requestIdRef.current) return
      setSnapshot(buildSnapshot(r.albums, r.singles))
      setReady(true)
    } finally {
      if (!silent && requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSnapshot(false)
  }, [loadSnapshot])

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  useEventStream((type, data) => {
    if (type !== 'job.update' || data?.status !== 'done') return
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      void loadSnapshot(true)
    }, 250)
  })

  const isAlbumInLibrary = useCallback(
    (album: AlbumLookup | null | undefined) => {
      const key = makeAlbumKey(album)
      return Boolean(key && snapshot.albumKeys[key])
    },
    [snapshot.albumKeys],
  )

  const isSongInLibrary = useCallback(
    (song: SongLookup | null | undefined) => {
      const key = makeSongKey(song)
      return Boolean(key && snapshot.songKeys[key])
    },
    [snapshot.songKeys],
  )

  const verifyAlbumPresence = useCallback(
    async (album: AlbumLookup | null | undefined, force = false) => {
      const artistName = String(album?.artistName || '').trim()
      const albumName = getAlbumName(album)
      const key = makeAlbumKey(album)
      if (!artistName || !albumName || !key) return false
      if (!force && snapshot.albumKeys[key]) return true
      const requestId = String(album?.id || key)
      const r = await api.libraryPresence({
        albums: [{ id: requestId, artistName, albumName }],
      })
      const present = Boolean(r.albums?.[requestId])
      if (present) {
        setSnapshot((prev) =>
          prev.albumKeys[key]
            ? prev
            : { ...prev, albumKeys: { ...prev.albumKeys, [key]: true } },
        )
      } else {
        setSnapshot((prev) => {
          if (!prev.albumKeys[key]) return prev
          const next = { ...prev.albumKeys }
          delete next[key]
          return { ...prev, albumKeys: next }
        })
      }
      return present
    },
    [snapshot.albumKeys],
  )

  const verifySongPresence = useCallback(
    async (song: SongLookup | null | undefined, force = false) => {
      const artistName = String(song?.artistName || '').trim()
      const songName = getSongName(song)
      const key = makeSongKey(song)
      if (!artistName || !songName || !key) return false
      if (!force && snapshot.songKeys[key]) return true
      const requestId = String(song?.id || key)
      const r = await api.libraryPresence({
        songs: [{ id: requestId, artistName, songName }],
      })
      const present = Boolean(r.songs?.[requestId])
      if (present) {
        setSnapshot((prev) =>
          prev.songKeys[key]
            ? prev
            : { ...prev, songKeys: { ...prev.songKeys, [key]: true } },
        )
      } else {
        setSnapshot((prev) => {
          if (!prev.songKeys[key]) return prev
          const next = { ...prev.songKeys }
          delete next[key]
          return { ...prev, songKeys: next }
        })
      }
      return present
    },
    [snapshot.songKeys],
  )

  const refreshLibraryPresence = useCallback(async () => {
    await loadSnapshot(true)
  }, [loadSnapshot])

  const value = useMemo<LibraryPresenceContextValue>(
    () => ({
      loading,
      ready,
      isAlbumInLibrary,
      isSongInLibrary,
      verifyAlbumPresence,
      verifySongPresence,
      refreshLibraryPresence,
    }),
    [
      isAlbumInLibrary,
      isSongInLibrary,
      loading,
      ready,
      refreshLibraryPresence,
      verifyAlbumPresence,
      verifySongPresence,
    ],
  )

  return (
    <LibraryPresenceContext.Provider value={value}>
      {children}
    </LibraryPresenceContext.Provider>
  )
}

export function useLibraryPresence() {
  const value = useContext(LibraryPresenceContext)
  if (!value) {
    throw new Error('useLibraryPresence must be used within LibraryPresenceProvider')
  }
  return value
}

function buildSnapshot(albums: LibraryAlbum[], singles: LibrarySingle[]): PresenceSnapshot {
  const albumKeys: Record<string, true> = {}
  const songKeys: Record<string, true> = {}

  for (const album of albums) {
    const key = makeAlbumKey(album)
    if (key) albumKeys[key] = true
  }

  for (const single of singles) {
    const key = makeSongKey(single)
    if (key) songKeys[key] = true
  }

  return { albumKeys, songKeys }
}

function makeAlbumKey(album: AlbumLookup | LibraryAlbum | null | undefined) {
  const artistName = sanitizeLookupSegment(String(album?.artistName || ''))
  const albumName = sanitizeLookupSegment(getAlbumName(album))
  if (!artistName || !albumName || artistName === '_' || albumName === '_') return ''
  return `${artistName}::${albumName}`
}

function makeSongKey(song: SongLookup | LibrarySingle | null | undefined) {
  const artistName = sanitizeLookupSegment(String(song?.artistName || ''))
  const songName = sanitizeLookupSegment(getSongName(song))
  if (!artistName || !songName || artistName === '_' || songName === '_') return ''
  return `${artistName}::${songName}`
}

function getAlbumName(album: AlbumLookup | LibraryAlbum | null | undefined) {
  if (!album) return ''
  const albumName = 'albumName' in album ? album.albumName : album.name
  return stripYear(String(albumName || ''))
}

function getSongName(song: SongLookup | LibrarySingle | null | undefined) {
  if (!song) return ''
  const songName = 'songName' in song ? song.songName : song.name
  return String(songName || '').trim()
}

function sanitizeLookupSegment(value: string) {
  return (
    String(value || '')
      .replace(BAD_CHARS, '_')
      .replace(/\.+$/g, '')
      .trim()
      .slice(0, 200) || '_'
  ).toLowerCase()
}
