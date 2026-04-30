import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { X, ListChecks, Disc3, Music2, Album as AlbumIcon } from 'lucide-react'

import { api, artworkUrl, type Album, type QualityPreference } from '../api/client'
import { stripYear } from '../lib/format'
import { cx } from '../lib/cx'
import { useAppSettings } from '../hooks/useAppSettings'
import { Modal } from './Modal'
import { Badge } from './Badge'
import { Button } from './Button'
import { QualityPicker } from './QualityPicker'

type Kind = 'LP' | 'EP' | 'Single'
const ALL_KINDS: Kind[] = ['LP', 'EP', 'Single']

function kindOf(a: Album): Kind {
  const tc = a.trackCount ?? 0
  if (a.isSingle || tc <= 3) return 'Single'
  if (tc <= 6) return 'EP'
  return 'LP'
}

type Props = {
  open: boolean
  onClose: () => void
  artistName: string
  albums: Album[]
  inLibraryMap?: Record<string, boolean>
  onQueued?: (count: number) => void
}

export function SelectDownloadsModal({
  open,
  onClose,
  artistName,
  albums,
  inLibraryMap = {},
  onQueued,
}: Props) {
  const appSettings = useAppSettings()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedQuality, setSelectedQuality] = useState<QualityPreference>('flac')
  const [kinds, setKinds] = useState<Kind[]>(ALL_KINDS)
  const [deselectActive, setDeselectActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayOrder, setDisplayOrder] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setSelected(new Set(albums.filter((a) => !inLibraryMap[a.id]).map((a) => a.id)))
      setKinds(ALL_KINDS)
      setDeselectActive(false)
      setDisplayOrder(albums.map((a) => a.id))
      setSelectedQuality(appSettings?.quality || 'flac')
    }
  }, [open, albums, inLibraryMap, appSettings?.quality])

  const lpIds = useMemo(
    () => albums.filter((a) => kindOf(a) === 'LP').map((a) => a.id),
    [albums],
  )
  const epIds = useMemo(
    () => albums.filter((a) => kindOf(a) === 'EP').map((a) => a.id),
    [albums],
  )
  const singleIds = useMemo(
    () => albums.filter((a) => kindOf(a) === 'Single').map((a) => a.id),
    [albums],
  )
  const kindSet = useMemo(() => new Set(kinds), [kinds])
  const allKindsSelected = kinds.length === ALL_KINDS.length

  const reorderFromSelection = (nextSelected: Set<string>) => {
    const picked: string[] = []
    const rest: string[] = []
    for (const a of albums) {
      if (nextSelected.has(a.id)) picked.push(a.id)
      else rest.push(a.id)
    }
    setDisplayOrder([...picked, ...rest])
  }

  const applyKinds = (nextKinds: Kind[]) => {
    setKinds(nextKinds)
    setDeselectActive(false)
    const allowedKinds = new Set(nextKinds)
    const ids = albums
      .filter((a) => allowedKinds.has(kindOf(a)) && !inLibraryMap[a.id])
      .map((a) => a.id)
    const nextSelected = new Set(ids)
    setSelected(nextSelected)
    reorderFromSelection(nextSelected)
  }

  const selectAll = () => applyKinds(ALL_KINDS)
  const deselectAll = () => {
    setSelected(new Set())
    setKinds([])
    setDeselectActive(true)
    setDisplayOrder(albums.map((a) => a.id))
  }

  const toggleKind = (kind: Kind) => {
    const isAll = kinds.length === ALL_KINDS.length
    let nextKinds: Kind[]
    if (isAll) {
      nextKinds = [kind]
    } else if (kindSet.has(kind)) {
      nextKinds = kinds.filter((k) => k !== kind)
      if (nextKinds.length === 0) nextKinds = ALL_KINDS
    } else {
      nextKinds = [...kinds, kind]
    }
    applyKinds(nextKinds)
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (next.size > 0) setDeselectActive(false)
      return next
    })
  }

  const submit = async () => {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const ids = albums
        .filter((a) => selected.has(a.id) && !inLibraryMap[a.id])
        .map((a) => a.id)
      const quality = appSettings?.promptForDownloadQuality ? selectedQuality : undefined
      for (const id of ids) {
        await api.enqueue(id, quality)
      }
      onQueued?.(ids.length)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to queue downloads')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      label={`Queue albums from ${artistName}`}
      placement="center"
      className="!max-w-[44rem] max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col"
    >
      <header className="shrink-0 flex items-start justify-between gap-4 p-5 border-b border-white/[0.06]">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-white/55 mb-1">Queue albums</div>
          <h2 className="text-lg md:text-xl font-semibold truncate">{artistName}</h2>
          <div className="mt-1 text-sm text-white/55">
            {selected.size} of {albums.length} selected
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 relative inline-flex items-center justify-center rounded-full border border-white/[0.12] bg-black/55 text-white/90 backdrop-blur-[10px] h-[30px] w-[30px]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div
        className="shrink-0 px-5 py-3 flex flex-wrap gap-2 border-b border-white/[0.06]"
        role="group"
        aria-label="Filter album types"
      >
        <FilterPill label="Select all" icon={ListChecks} active={allKindsSelected && !deselectActive} onClick={selectAll} count={albums.length} />
        <FilterPill label="LPs" icon={AlbumIcon} active={!allKindsSelected && kindSet.has('LP')} onClick={() => toggleKind('LP')} count={lpIds.length} />
        <FilterPill label="EPs" icon={Disc3} active={!allKindsSelected && kindSet.has('EP')} onClick={() => toggleKind('EP')} count={epIds.length} />
        <FilterPill label="Singles" icon={Music2} active={!allKindsSelected && kindSet.has('Single')} onClick={() => toggleKind('Single')} count={singleIds.length} />
        <FilterPill label="Deselect all" icon={X} active={deselectActive} onClick={deselectAll} count={0} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {albums.length === 0 ? (
          <div className="p-8 text-center text-white/55 text-sm">No albums to queue.</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {displayOrder.map((id) => {
              const a = albums.find((x) => x.id === id)
              if (!a) return null
              return (
                <AlbumRow
                  key={a.id}
                  album={a}
                  checked={selected.has(a.id)}
                  blocked={Boolean(inLibraryMap[a.id])}
                  onToggle={() => toggle(a.id)}
                />
              )
            })}
          </ul>
        )}
      </div>

      {error && (
        <div className="px-5 pb-2">
          <Badge variant="bad">{error}</Badge>
        </div>
      )}

      {appSettings?.promptForDownloadQuality && (
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4">
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wider text-white/55">Download quality</div>
            <div className="mt-1 text-sm text-white/60">
              Applies to every selected album in this queue.
            </div>
          </div>
          <QualityPicker value={selectedQuality} onChange={setSelectedQuality} />
        </div>
      )}

      <footer className="shrink-0 p-4 flex items-center justify-end gap-2 border-t border-white/[0.06]">
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={submit} disabled={submitting || selected.size === 0}>
          <ListChecks className="h-4 w-4" />
          {submitting
            ? 'Queuing…'
            : `Queue ${selected.size} album${selected.size === 1 ? '' : 's'}`}
        </Button>
      </footer>
    </Modal>
  )
}

function FilterPill({
  label,
  icon: Icon,
  active,
  onClick,
  count,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
  count: number
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex select-none items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[0.8125rem] font-medium text-white/70 transition-[background,border-color,color,transform] duration-[160ms] ease-smooth hover:bg-white/[0.08] hover:text-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.30)]',
        active && '!border-accent/50 !bg-accent/22 !text-white',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && <span className="text-white/50 text-[11px] font-normal">{count}</span>}
    </button>
  )
}

function AlbumRow({
  album,
  checked,
  blocked,
  onToggle,
}: {
  album: Album
  checked: boolean
  blocked: boolean
  onToggle: () => void
}) {
  const art = artworkUrl(album.artworkTemplate, 100)
  const kind = kindOf(album)
  const KindIcon = kind === 'Single' ? Music2 : kind === 'EP' ? Disc3 : AlbumIcon
  return (
    <motion.li layout transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
      <div className="flex items-center gap-3 px-3 py-2 rounded-app hover:bg-white/[0.04] transition-colors">
        <input
          type="checkbox"
          className="h-[22px] w-[22px] min-w-[22px] cursor-pointer rounded-md border border-white/20 bg-white/[0.04] accent-[rgb(var(--accent))] transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.35)] disabled:cursor-not-allowed disabled:opacity-60"
          checked={checked}
          disabled={blocked}
          onChange={onToggle}
          aria-label={`Select ${album.name}`}
        />
        <Link to={`/album/${album.id}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/50 block">
          {art && <img src={art} alt="" className="h-full w-full object-cover" />}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            <Link to={`/album/${album.id}`} className="hover:text-accent transition-colors">
              {stripYear(album.name)}
            </Link>
          </div>
          <div className="truncate text-xs text-white/55">
            {album.year ? `${album.year} · ` : ''}
            {album.trackCount ? `${album.trackCount} tracks` : ''}
          </div>
        </div>
        <Badge className="shrink-0">
          <KindIcon className="h-3 w-3" />
          {kind}
        </Badge>
        {blocked && <Badge className="shrink-0">In library</Badge>}
      </div>
    </motion.li>
  )
}
