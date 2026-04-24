// Dedup album listings by (name + artist) according to the user's
// explicitFilter preference. Preserves original ordering; when the preferred
// rating is missing, falls back to whatever is available so clean-only or
// explicit-only albums still show up.

function normalize(s) {
  return String(s || '').trim().toLowerCase()
}

function groupKey(album) {
  return `${normalize(album.name)}|${normalize(album.artistName)}`
}

export function filterAlbumsByRating(albums, preference) {
  if (!Array.isArray(albums) || albums.length === 0) return albums || []
  if (preference === 'both') return albums

  const pref = preference === 'clean' ? 'clean' : 'explicit'

  const groups = new Map()
  for (const album of albums) {
    const key = groupKey(album)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, album)
      continue
    }
    const existingMatches = existing.contentRating === pref
    const candidateMatches = album.contentRating === pref
    if (candidateMatches && !existingMatches) {
      groups.set(key, album)
    }
  }

  const kept = new Set(groups.values())
  return albums.filter((a) => kept.has(a))
}
