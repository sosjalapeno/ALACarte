import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { api, artworkSrcSet, artworkUrl, type Playlist } from '../api/client'
import { cx } from '../lib/cx'
import { useLibraryPresence } from '../hooks/useLibraryPresence'
import { useQueue } from '../hooks/useQueue'
import { useTouchMode } from '../hooks/useTouchMode'
import { Card } from './Card'
import { DownloadButton } from './DownloadButton'

type Props = {
  playlist: Playlist
}

export function PlaylistCard({ playlist }: Props) {
  const { jobs } = useQueue()
  const { ready, isPlaylistInLibrary, verifyPlaylistPresence } = useLibraryPresence()
  const touchMode = useTouchMode()
  const blocked = isPlaylistInLibrary(playlist)
  const matching = useMemo(() => {
    const active = jobs.find(
      (j) =>
        j.kind === 'playlist' &&
        j.playlistId === playlist.id &&
        (j.status === 'queued' || j.status === 'running'),
    )
    if (active) return active
    if (blocked) {
      return jobs.find((j) => j.kind === 'playlist' && j.playlistId === playlist.id) || null
    }
    return null
  }, [jobs, playlist.id, blocked])
  const busyOrDone =
    !!matching &&
    (matching.status === 'running' ||
      matching.status === 'queued' ||
      matching.status === 'done')

  const thumb = artworkUrl(playlist.artworkTemplate, 600)
  const bgColor = playlist.artworkColor ? `#${playlist.artworkColor}` : '#1a1a1a'

  return (
    <Card
      hover
      className="group relative block"
      style={{ backgroundColor: bgColor }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-black/50">
        <Link to={`/playlist/${playlist.id}`} className="block h-full w-full">
          {thumb ? (
            <img
              src={thumb}
              srcSet={artworkSrcSet(playlist.artworkTemplate)}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
              loading="lazy"
              alt=""
              className="h-full w-full object-cover transition-transform duration-700 ease-smooth group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30 text-3xl">
              ♫
            </div>
          )}
          {blocked && (
            <div className="absolute top-2 left-2 z-10">
              <div className="rounded bg-emerald-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ring-1 ring-white/20">
                In Library
              </div>
            </div>
          )}
        </Link>
        <div className="absolute top-2 right-2 z-10">
          <DownloadButton
            job={matching}
            onStart={async () => {
              if (!ready && (await verifyPlaylistPresence(playlist))) return false
              try {
                await api.enqueuePlaylist(playlist.id)
                return true
              } catch (err: any) {
                if (/already in library/i.test(String(err?.message || ''))) {
                  await verifyPlaylistPresence(playlist)
                  return false
                }
                throw err
              }
            }}
            ariaLabel={`Download ${playlist.name}`}
            blocked={blocked}
            className={cx(
              busyOrDone || touchMode
                ? 'opacity-100'
                : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200',
            )}
          />
        </div>
      </div>
      <div className="p-3 backdrop-blur-md bg-black/30">
        <div className="truncate text-sm font-medium text-white">
          <Link to={`/playlist/${playlist.id}`} className="hover:text-accent transition-colors">
            {playlist.name}
          </Link>
        </div>
        <div className="truncate text-xs text-white/60">
          {playlist.curatorName}
          {typeof playlist.trackCount === 'number' ? ` · ${playlist.trackCount} tracks` : ''}
        </div>
      </div>
    </Card>
  )
}
