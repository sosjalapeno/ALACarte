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
  type Playlist,
  type Song,
} from '../api/client'
import { stripYear } from '../lib/format'
import { useEventStream } from './useEventStream'

type AlbumLookup = Pick<Album, 'id' | 'artistName' | 'name'> & { albumName?: string | null }
type SongLookup = Pick<Song, 'id' | 'artistName' | 'name'> & { songName?: string | null }
type PlaylistLookup = Pick<Playlist, 'id'>

export type AlbumTrackPresence = {
  present: number
  expected: number
  complete: boolean
  folderExists: boolean
  tracks: Record<string, boolean>
}

type AlbumTracksLookup = {
  id: string
  artistName: string
  name: string
  tracks: Array<{ id: string; name: string }>
}

type LibraryPresenceContextValue = {
  loading: boolean
  ready: boolean
  isAlbumInLibrary: (album: AlbumLookup | null | undefined) => boolean
  isSongInLibrary: (song: SongLookup | null | undefined) => boolean
  isPlaylistInLibrary: (playlist: PlaylistLookup | null | undefined) => boolean
  verifyAlbumPresence: (album: AlbumLookup | null | undefined, force?: boolean) => Promise<boolean>
  verifySongPresence: (song: SongLookup | null | undefined, force?: boolean) => Promise<boolean>
  verifyPlaylistPresence: (playlist: PlaylistLookup | null | undefined, force?: boolean) => Promise<boolean>
  verifyAlbumTracksPresence: (
    album: AlbumTracksLookup | null | undefined,
    force?: boolean,
  ) => Promise<AlbumTrackPresence | null>
  getAlbumTrackPresence: (albumId: string | null | undefined) => AlbumTrackPresence | null
  refreshLibraryPresence: () => Promise<void>
}

type PresenceSnapshot = {
  albumKeys: Record<string, true>
  songKeys: Record<string, true>
  playlistIds: Record<string, true>
  albumTrackPresence: Record<string, AlbumTrackPresence>
}

const BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/g
const LibraryPresenceContext = createContext<LibraryPresenceContextValue | null>(null)

export function LibraryPresenceProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>({ albumKeys: {}, songKeys: {}, playlistIds: {}, albumTrackPresence: {} })
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
      setSnapshot((prev) => ({
        ...buildSnapshot(r.albums, r.singles, r.playlistIds || []),
        albumTrackPresence: prev.albumTrackPresence,
      }))
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
    const albumId = String(data?.albumId || '')
    if (albumId) {
      setSnapshot((prev) => {
        if (!prev.albumTrackPresence[albumId]) return prev
        const next = { ...prev.albumTrackPresence }
        delete next[albumId]
        return { ...prev, albumTrackPresence: next }
      })
    }
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

  const isPlaylistInLibrary = useCallback(
    (playlist: PlaylistLookup | null | undefined) => {
      const id = String(playlist?.id || '')
      return Boolean(id && snapshot.playlistIds[id])
    },
    [snapshot.playlistIds],
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

  const verifyPlaylistPresence = useCallback(
    async (playlist: PlaylistLookup | null | undefined, force = false) => {
      const id = String(playlist?.id || '')
      if (!id) return false
      if (!force && snapshot.playlistIds[id]) return true
      const r = await api.libraryPresence({ playlists: [{ id }] })
      const present = Boolean(r.playlists?.[id])
      setSnapshot((prev) => {
        if (present === Boolean(prev.playlistIds[id])) return prev
        const next = { ...prev.playlistIds }
        if (present) next[id] = true
        else delete next[id]
        return { ...prev, playlistIds: next }
      })
      return present
    },
    [snapshot.playlistIds],
  )

  const verifyAlbumTracksPresence = useCallback(
    async (album: AlbumTracksLookup | null | undefined, force = false) => {
      const id = String(album?.id || '')
      const artistName = String(album?.artistName || '').trim()
      const albumName = String(album?.name || '').trim()
      const tracks = (album?.tracks || []).filter((t) => t && t.id && t.name)
      if (!id || !artistName || !albumName || tracks.length === 0) return null
      if (!force && snapshot.albumTrackPresence[id]) {
        return snapshot.albumTrackPresence[id]
      }
      const r = await api.libraryPresence({
        albumTracks: [
          {
            id,
            artistName,
            albumName,
            tracks: tracks.map((t) => ({ id: String(t.id), name: String(t.name) })),
          },
        ],
      })
      const entry = r.albumTracks?.[id] || null
      if (!entry) return null
      setSnapshot((prev) => ({
        ...prev,
        albumTrackPresence: { ...prev.albumTrackPresence, [id]: entry },
      }))
      return entry
    },
    [snapshot.albumTrackPresence],
  )

  const getAlbumTrackPresence = useCallback(
    (albumId: string | null | undefined) => {
      const id = String(albumId || '')
      if (!id) return null
      return snapshot.albumTrackPresence[id] || null
    },
    [snapshot.albumTrackPresence],
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
      isPlaylistInLibrary,
      verifyAlbumPresence,
      verifySongPresence,
      verifyPlaylistPresence,
      verifyAlbumTracksPresence,
      getAlbumTrackPresence,
      refreshLibraryPresence,
    }),
    [
      isAlbumInLibrary,
      isSongInLibrary,
      isPlaylistInLibrary,
      loading,
      ready,
      refreshLibraryPresence,
      verifyAlbumPresence,
      verifySongPresence,
      verifyPlaylistPresence,
      verifyAlbumTracksPresence,
      getAlbumTrackPresence,
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

function buildSnapshot(
  albums: LibraryAlbum[],
  singles: LibrarySingle[],
  playlistIdsArr: string[],
): PresenceSnapshot {
  const albumKeys: Record<string, true> = {}
  const songKeys: Record<string, true> = {}
  const playlistIds: Record<string, true> = {}

  for (const album of albums) {
    const key = makeAlbumKey(album)
    if (key) albumKeys[key] = true
  }

  for (const single of singles) {
    const key = makeSongKey(single)
    if (key) songKeys[key] = true
  }

  for (const id of playlistIdsArr || []) {
    if (id) playlistIds[String(id)] = true
  }

  return { albumKeys, songKeys, playlistIds, albumTrackPresence: {} }
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
