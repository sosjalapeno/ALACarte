import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ListChecks, X } from 'lucide-react'

import { api, type Album, type Artist as ArtistT } from '../api/client'
import { AlbumCard } from '../components/AlbumCard'
import { SelectDownloadsModal } from '../components/SelectDownloadsModal'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { StaggeredList, StaggeredItem } from '../components/StaggeredList'
import { useLibraryPresence } from '../hooks/useLibraryPresence'

export function ArtistPage() {
  const { id } = useParams<{ id: string }>()
  const [artist, setArtist] = useState<ArtistT | null>(null)
  const [albums, setAlbums] = useState<Album[]>([])
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)
  const { isAlbumInLibrary } = useLibraryPresence()

  useEffect(() => {
    if (!queuedCount) return
    const t = setTimeout(() => setQueuedCount(0), 6000)
    return () => clearTimeout(t)
  }, [queuedCount])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .artist(id)
      .then((r) => {
        if (!cancelled) {
          setArtist(r.artist)
          setAlbums(r.albums)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load')
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const inLibraryAlbums = useMemo(
    () =>
      Object.fromEntries(albums.map((album) => [album.id, isAlbumInLibrary(album)])),
    [albums, isAlbumInLibrary],
  )

  return (
    <div className="mx-auto w-full max-w-7xl pt-4 md:pt-6 space-y-4">
      {queuedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-app border border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.10)] px-4 py-2.5 text-sm text-white/90 backdrop-blur-[10px]">
          <div>
            Queued <b>{queuedCount}</b> album{queuedCount === 1 ? '' : 's'}.{' '}
            <Link
              to="/"
              className="font-medium text-[rgb(var(--accent))] underline underline-offset-2 transition-colors hover:text-white"
            >
              Open activity
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setQueuedCount(0)}
            aria-label="Dismiss"
            className="shrink-0 inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[rgba(var(--accent),0.25)] bg-[rgba(var(--accent),0.08)] text-white/75 transition-[background,border-color,color] duration-[250ms] ease-smooth hover:border-[rgba(var(--accent),0.45)] hover:bg-[rgba(var(--accent),0.18)] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {error && <Badge variant="bad">{error}</Badge>}
      {artist && (
        <>
          <header>
            <div className="text-xs uppercase tracking-wider text-white/55 mb-1">Artist</div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{artist.name}</h1>
            {artist.genreNames && artist.genreNames.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {artist.genreNames.slice(0, 4).map((g) => (
                  <Badge key={g}>{g}</Badge>
                ))}
              </div>
            )}
            {albums.length > 0 && (
              <div className="mt-4">
                <Button onClick={() => setModalOpen(true)}>
                  <ListChecks className="h-4 w-4" />
                  Download multiple
                </Button>
              </div>
            )}
          </header>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">Albums</h2>
            {albums.length === 0 ? (
              <Card className="p-6 text-sm text-white/55">No albums found.</Card>
            ) : (
              <StaggeredList className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                {albums.map((a) => (
                  <StaggeredItem key={a.id}>
                    <AlbumCard album={a} />
                  </StaggeredItem>
                ))}
              </StaggeredList>
            )}
          </section>
        </>
      )}
      <SelectDownloadsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        artistName={artist?.name || 'Artist'}
        albums={albums}
        inLibraryMap={inLibraryAlbums}
        onQueued={(n) => setQueuedCount(n)}
      />
    </div>
  )
}
