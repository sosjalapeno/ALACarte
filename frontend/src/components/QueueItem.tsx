import { Link } from 'react-router-dom'
import { X, CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react'

import { api, type Job } from '../api/client'
import { stripYear, formatPercent } from '../lib/format'
import { ProgressBar } from './ProgressBar'
import { Card } from './Card'
import { ResolvedMediaLink } from './ResolvedMediaLink'

type Props = {
  job: Job
}

export function QueueItem({ job }: Props) {
  const StatusIcon =
    job.status === 'done'
      ? CheckCircle2
      : job.status === 'failed'
        ? AlertCircle
        : job.status === 'running'
          ? Loader2
          : Clock
  const statusColor =
    job.status === 'done'
      ? 'text-emerald-400'
      : job.status === 'failed'
        ? 'text-rose-400'
        : 'text-accent'
  const spin = job.status === 'running' ? 'animate-spin' : ''

  const onCancel = async () => {
    try {
      await api.cancel(job.id)
    } catch {}
  }

  return (
    <Card hover className="flex items-center gap-3 p-3 md:gap-4">
      <div className="shrink-0 h-14 w-14 md:h-16 md:w-16 overflow-hidden rounded-xl bg-black/50">
        {job.artworkUrl ? (
          <Link to={`/album/${job.albumId}`} className="block h-full w-full">
            <img src={job.artworkUrl} alt="" className="h-full w-full object-cover" />
          </Link>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={`h-4 w-4 shrink-0 ${statusColor} ${spin}`} strokeWidth={2} />
          <div className="truncate text-sm font-medium">
            <ResolvedMediaLink
              kind="album"
              artistId={job.artistId}
              artistName={job.artist}
              albumId={job.albumId}
              albumName={job.albumTitle}
              className="hover:text-accent transition-colors"
            >
              {stripYear(job.albumTitle)}
            </ResolvedMediaLink>
          </div>
        </div>
        <div className="truncate text-xs text-white/55 mt-0.5">
          <ResolvedMediaLink
            kind="artist"
            artistId={job.artistId}
            artistName={job.artist}
            className="hover:text-accent transition-colors"
          >
            {job.artist}
          </ResolvedMediaLink>
          {job.status !== 'failed' && job.message ? ` · ${job.message}` : ''}
        </div>
        {(job.status === 'running' || job.status === 'queued') && (
          <div className="mt-2"><ProgressBar value={job.progress} label={formatPercent(job.progress)} /></div>
        )}
        {job.status === 'failed' && (job.error || job.message) && (
          <div className="mt-1 text-xs text-rose-400 truncate">{job.error || job.message}</div>
        )}
      </div>
      {(job.status === 'queued' || job.status === 'running') && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </Card>
  )
}
