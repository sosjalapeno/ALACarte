import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { api, artworkSrcSet, artworkUrl, type Album } from '../api/client'
import { stripYear } from '../lib/format'
import { cx } from '../lib/cx'
import { useAppSettings } from '../hooks/useAppSettings'
import { useLibraryPresence } from '../hooks/useLibraryPresence'
import { useQueue } from '../hooks/useQueue'
import { useTouchMode } from '../hooks/useTouchMode'
import { Card } from './Card'
import { DownloadButton } from './DownloadButton'
import { ResolvedMediaLink } from './ResolvedMediaLink'

type Props = {
  album: Album
  size?: 'sm' | 'md'
  alreadyInLibrary?: boolean
}

export function AlbumCard({ album, size = 'md', alreadyInLibrary = false }: Props) {
  const { jobs } = useQueue()
  const { ready, isAlbumInLibrary, verifyAlbumPresence, getAlbumTrackPresence } = useLibraryPresence()
  const touchMode = useTouchMode()
  const appSettings = useAppSettings()
  const showRatingBadge =
    appSettings?.explicitFilter === 'both' &&
    (album.contentRating === 'explicit' || album.contentRating === 'clean')
  const trackPresence = getAlbumTrackPresence(album.id)
  const partial = Boolean(
    trackPresence &&
      trackPresence.expected > 0 &&
      trackPresence.present > 0 &&
      trackPresence.present < trackPresence.expected,
  )
  const fullByTracks = Boolean(trackPresence?.complete)
  const blocked = alreadyInLibrary || fullByTracks || (!trackPresence && isAlbumInLibrary(album))
  const matching = useMemo(() => {
    const active = jobs.find(
      (j) =>
        j.albumId === album.id &&
        (j.status === 'queued' || j.status === 'running'),
    )
    if (active) return active
    if (blocked) return jobs.find((j) => j.albumId === album.id) || null
    return null
  }, [jobs, album.id, blocked])
  const busyOrDone =
    (!!matching &&
      (matching.status === 'running' ||
        matching.status === 'queued' ||
        matching.status === 'done'))
  const thumb = artworkUrl(album.artworkTemplate, size === 'sm' ? 300 : 600)
  const bgColor = album.artworkColor ? `#${album.artworkColor}` : '#1a1a1a'
  return (
    <Card
      hover
      className="group relative block"
      style={{ backgroundColor: bgColor }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-black/50">
        <Link to={`/album/${album.id}`} className="block h-full w-full">
          {thumb ? (
            <img
              src={thumb}
              srcSet={artworkSrcSet(album.artworkTemplate)}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
              loading="lazy"
              alt=""
              className="h-full w-full object-cover transition-transform duration-700 ease-smooth group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              ♪
            </div>
          )}
          {(blocked || partial || showRatingBadge) && (
            <div className="absolute top-2 left-2 z-10 flex flex-col items-start gap-1">
              {blocked && (
                <div className="rounded bg-emerald-500/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ring-1 ring-white/20">
                  In Library
                </div>
              )}
              {partial && !blocked && (
                <div
                  className="rounded bg-amber-400/90 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow-sm ring-1 ring-black/10"
                  title={`${trackPresence?.present || 0} of ${trackPresence?.expected || 0} tracks downloaded`}
                >
                  Partial
                </div>
              )}
              {showRatingBadge && album.contentRating === 'explicit' && (
                <div
                  className="rounded bg-black/80 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ring-1 ring-white/15"
                  title="Explicit"
                >
                  E
                </div>
              )}
              {showRatingBadge && album.contentRating === 'clean' && (
                <div
                  className="rounded bg-sky-200/95 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow-sm ring-1 ring-black/10"
                  title="Clean"
                >
                  Clean
                </div>
              )}
            </div>
          )}
        </Link>
        <div className="absolute top-2 right-2 z-10">
          <DownloadButton
            job={matching}
            onStart={async () => {
              if (!ready && (await verifyAlbumPresence(album))) return false
              try {
                await api.enqueue(album.id)
                return true
              } catch (err: any) {
                if (/already in library/i.test(String(err?.message || ''))) {
                  await verifyAlbumPresence(album)
                  return false
                }
                throw err
              }
            }}
            ariaLabel={`Download ${album.name}`}
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
          <Link to={`/album/${album.id}`} className="hover:text-accent transition-colors">
            {stripYear(album.name)}
          </Link>
        </div>
        <div className="truncate text-xs text-white/60">
          <ResolvedMediaLink
            kind="artist"
            artistId={album.artistId}
            artistName={album.artistName}
            className="hover:text-accent transition-colors"
          >
            {album.artistName}
          </ResolvedMediaLink>
          {album.year ? ` · ${album.year}` : ''}
        </div>
      </div>
    </Card>
  )
}
