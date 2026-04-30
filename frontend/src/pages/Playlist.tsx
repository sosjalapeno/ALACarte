import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Clock3, Badge as BadgeIcon, Download } from 'lucide-react'

import {
  api,
  artworkSrcSet,
  artworkUrl,
  type LibraryPlaylistDetail,
  type PlaylistDetail,
} from '../api/client'
import { useQueue } from '../hooks/useQueue'
import { Badge } from '../components/Badge'
import { ResolvedMediaLink } from '../components/ResolvedMediaLink'
import { formatPercent } from '../lib/format'
import { StaggeredList, StaggeredItem } from '../components/StaggeredList'
import { ProgressBar } from '../components/ProgressBar'
import { Button } from '../components/Button'

type AnyPlaylist =
  | (PlaylistDetail & { libraryId?: undefined; isUserCreated?: undefined; undownloadableCount?: undefined })
  | (LibraryPlaylistDetail & { url?: undefined; lastModifiedDate?: undefined })

function formatDur(ms: number | undefined) {
  if (!ms || !Number.isFinite(ms)) return '—'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlaylistPage() {
  const params = useParams<{ id?: string; libraryId?: string }>()
  const libraryId = params.libraryId || null
  const catalogId = libraryId ? null : params.id || null
  const [playlist, setPlaylist] = useState<AnyPlaylist | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enqueueing, setEnqueueing] = useState(false)
  const { jobs } = useQueue()

  const existingPlaylistJob = useMemo(
    () =>
      jobs.find(
        (j) =>
          j.kind === 'playlist' &&
          ((libraryId && j.libraryPlaylistId === libraryId) ||
            (catalogId && j.playlistId === catalogId)) &&
          (j.status === 'queued' || j.status === 'running'),
      ) ||
      jobs.find(
        (j) =>
          j.kind === 'playlist' &&
          ((libraryId && j.libraryPlaylistId === libraryId) ||
            (catalogId && j.playlistId === catalogId)) &&
          j.status === 'done',
      ),
    [jobs, catalogId, libraryId],
  )

  useEffect(() => {
    let cancelled = false
    if (!libraryId && !catalogId) return
    const loader = libraryId ? api.libraryPlaylist(libraryId) : api.playlist(catalogId!)
    loader
      .then((r) => {
        if (!cancelled) setPlaylist(r.playlist as AnyPlaylist)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load')
      })
    return () => {
      cancelled = true
    }
  }, [catalogId, libraryId])

  const coverBig = artworkUrl(playlist?.artworkTemplate, 600)
  const bgColor = playlist?.artworkColor ? `#${playlist.artworkColor}` : '#1a1a1a'

  const activePlaylistTrackJobs = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.kind === 'song' &&
          playlist?.tracks.some((t) => t.id === j.songId) &&
          (j.status === 'queued' || j.status === 'running'),
      ),
    [jobs, playlist],
  )

  const onDownload = async () => {
    if (!playlist) return
    setEnqueueing(true)
    try {
      if (libraryId) {
        await api.enqueueLibraryPlaylist(libraryId)
      } else if (catalogId) {
        await api.enqueuePlaylist(catalogId)
      }
    } catch (err: any) {
      setError(err?.message || 'Enqueue failed')
    } finally {
      setEnqueueing(false)
    }
  }

  const isLibraryMode = Boolean(libraryId)
  const undownloadable = isLibraryMode
    ? (playlist as LibraryPlaylistDetail | null)?.undownloadableCount || 0
    : 0
  const isUserCreated = isLibraryMode
    ? Boolean((playlist as LibraryPlaylistDetail | null)?.isUserCreated)
    : false
  const downloadable = isLibraryMode
    ? Boolean((playlist as LibraryPlaylistDetail | null)?.downloadable)
    : true

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-6">
      {error && <Badge variant="bad">{error}</Badge>}

      {playlist && (
        <StaggeredList
          className="rounded-app overflow-hidden relative"
          style={{
            background: `linear-gradient(180deg, ${bgColor}99, transparent 300px)`,
          }}
        >
          <StaggeredItem className="p-4 md:p-8 flex flex-col md:flex-row gap-6">
            <div className="shrink-0 mx-auto md:mx-0 w-[min(280px,70vw)]">
              <div className="w-full aspect-square rounded-app overflow-hidden bg-black/50 shadow-2xl">
                {coverBig ? (
                  <img
                    src={coverBig}
                    srcSet={artworkSrcSet(playlist.artworkTemplate)}
                    sizes="(max-width: 768px) 70vw, 280px"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/20 text-5xl">
                    ♫
                  </div>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="text-xs uppercase tracking-wider text-white/55 mb-1">
                {isUserCreated ? 'Your Playlist' : 'Playlist'}
              </div>
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight">{playlist.name}</h1>
              <div className="mt-1 text-white/70">
                {playlist.curatorName}
                {playlist.trackCount ? ` · ${playlist.trackCount} tracks` : ''}
              </div>
              {playlist.description && (
                <p className="mt-2 text-sm text-white/50 line-clamp-3">{playlist.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {playlist.hasHiRes && <Badge>Hi-Res Lossless</Badge>}
                {playlist.hasLossless && !playlist.hasHiRes && <Badge>Lossless</Badge>}
                {playlist.hasAtmos && <Badge>Dolby Atmos</Badge>}
                {undownloadable > 0 && (
                  <Badge variant="warn">
                    {undownloadable} not on Apple Music
                  </Badge>
                )}
              </div>
              {(existingPlaylistJob?.status === 'queued' ||
                existingPlaylistJob?.status === 'running') && (
                <div className="mt-4">
                  <ProgressBar
                    value={existingPlaylistJob.progress}
                    label={`${formatPercent(existingPlaylistJob.progress)} · ${existingPlaylistJob.message || existingPlaylistJob.status}`}
                  />
                </div>
              )}
              <div className="mt-4 md:mt-6 flex flex-col gap-3">
                <div className="flex gap-2 md:sticky md:top-20">
                  <Button
                    onClick={onDownload}
                    disabled={
                      enqueueing ||
                      !downloadable ||
                      (existingPlaylistJob && existingPlaylistJob.status !== 'failed')
                    }
                    className="flex-1 md:min-w-[200px] md:flex-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {existingPlaylistJob?.status === 'done'
                      ? 'Already imported'
                      : existingPlaylistJob?.status === 'queued'
                        ? 'Queued'
                        : existingPlaylistJob?.status === 'running'
                          ? 'Downloading…'
                          : !downloadable
                            ? 'No downloadable tracks'
                            : 'Download Playlist'}
                  </Button>
                </div>
              </div>

              {activePlaylistTrackJobs.length > 0 && (
                <div className="mt-4 text-sm text-white/50">
                  {activePlaylistTrackJobs.length} track{activePlaylistTrackJobs.length !== 1 ? 's' : ''} downloading…
                </div>
              )}
            </div>
          </StaggeredItem>

          <div className="px-4 md:px-8 pb-8">
            <div className="mt-2 border-t border-white/10 pt-4">
              <div className="grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_8rem_5rem] gap-x-3 gap-y-0 text-xs uppercase tracking-wider text-white/40 border-b border-white/5 py-2">
                <div>#</div>
                <div>Title</div>
                <div className="hidden md:block">Artist</div>
                <div className="text-right"><Clock3 className="h-3.5 w-3.5 inline" /></div>
              </div>
              {playlist.tracks.map((t, i) => {
                const matchingJob = jobs.find(
                  (j) => j.songId === t.id && (j.status === 'queued' || j.status === 'running'),
                )
                return (
                  <StaggeredItem
                    key={t.id}
                    className="grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_8rem_5rem] gap-x-3 py-2.5 items-center border-b border-white/5 hover:bg-accent/[0.05] transition-colors rounded-[6px]"
                  >
                    <div className="text-white/45 tabular-nums text-sm">{i + 1}</div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {t.name}
                        {t.hasHiRes && (
                          <BadgeIcon className="h-3.5 w-3.5 text-accent inline ml-1.5" aria-label="Hi-Res" />
                        )}
                      </div>
                      <div className="md:hidden truncate text-xs text-white/50">
                        <ResolvedMediaLink
                          kind="artist"
                          artistId={t.artistId}
                          artistName={t.artistName}
                          className="hover:text-accent transition-colors"
                        >
                          {t.artistName}
                        </ResolvedMediaLink>
                        {t.albumName && ` · ${t.albumName}`}
                      </div>
                    </div>
                    <div className="hidden md:block truncate text-sm text-white/60">
                      <ResolvedMediaLink
                        kind="artist"
                        artistId={t.artistId}
                        artistName={t.artistName}
                        className="hover:text-accent transition-colors"
                      >
                        {t.artistName}
                      </ResolvedMediaLink>
                    </div>
                    <div className="text-right text-sm text-white/55 tabular-nums flex items-center justify-end gap-1.5">
                      {matchingJob && (
                        <span className="text-[10px] text-accent font-semibold uppercase tracking-wide">
                          {matchingJob.status === 'running'
                            ? `${formatPercent(matchingJob.progress)}`
                            : 'Queued'}
                        </span>
                      )}
                      {formatDur(t.durationMs)}
                    </div>
                  </StaggeredItem>
                )
              })}
            </div>
          </div>
        </StaggeredList>
      )}
    </div>
  )
}
