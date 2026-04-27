import { Link } from 'react-router-dom'

import { artworkSrcSet, artworkUrl, type Playlist } from '../api/client'
import { Card } from './Card'

type Props = {
  playlist: Playlist
}

export function PlaylistCard({ playlist }: Props) {
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
        </Link>
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
