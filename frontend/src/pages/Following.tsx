import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Clock, RefreshCw, UserRoundCheck, X } from 'lucide-react'

import { api, artworkUrl, type FollowedArtist, type Job } from '../api/client'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { StaggeredItem, StaggeredList } from '../components/StaggeredList'
import { useActivityFeed } from '../hooks/useActivityFeed'

export function FollowingPage() {
  const { jobs } = useActivityFeed()
  const [artists, setArtists] = useState<FollowedArtist[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queuedCount, setQueuedCount] = useState(0)

  const reload = () => {
    setLoading(true)
    setError(null)
    api
      .following()
      .then((response) => setArtists(response.artists))
      .catch((err) => setError(err.message || 'Failed to load followed artists'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  const unfollow = async (id: string) => {
    const previous = artists
    setArtists((items) => items.filter((artist) => artist.id !== id))
    try {
      await api.unfollowArtist(id)
    } catch (err: any) {
      setArtists(previous)
      setError(err.message || 'Failed to unfollow artist')
    }
  }

  const runCheck = async () => {
    setChecking(true)
    setError(null)
    try {
      await api.runFollowingCheck()
      reload()
    } catch (err: any) {
      setError(err.message || 'Failed to check for releases')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pt-4 md:pt-6">
      <AnimatePresence>
        {queuedCount > 0 && (
          <motion.div
            key="queued-banner"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="flex items-center justify-between gap-3 rounded-app border border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.10)] px-4 py-2.5 text-sm text-white/90 backdrop-blur-[10px]"
          >
            <div>
              Queued <b>{queuedCount}</b> release{queuedCount === 1 ? '' : 's'}.{' '}
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
          </motion.div>
        )}
      </AnimatePresence>

      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Followed artists
          </h1>
          <p className="max-w-2xl text-sm text-white/60 md:text-base">
            Follow artists once and ALACarte will keep an eye out for future releases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={runCheck} disabled={checking || loading}>
            <RefreshCw className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {checking ? 'Checking…' : 'Check now'}
          </Button>
          <Button disabled={checking || loading} className="bg-[rgba(var(--accent),0.12)] border-[rgba(var(--accent),0.3)] text-white hover:bg-[rgba(var(--accent),0.2)]" onClick={() => {
            api.downloadMissingReleases().then((res) => { setQueuedCount(res.queued) }).catch((err: any) => setError(err.message || 'Failed to download missing releases'))
          }}>
            Download all previous discography
          </Button>
        </div>
      </section>

      {error && <Badge variant="bad">{error}</Badge>}

      {loading ? (
        <Card className="p-6 text-sm text-white/55">Loading followed artists…</Card>
      ) : artists.length === 0 ? (
        <Card className="relative overflow-hidden p-8 md:p-10">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[rgba(var(--accent),0.12)] blur-3xl" />
          <div className="relative max-w-xl space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(var(--accent),0.25)] bg-[rgba(var(--accent),0.10)] text-[rgb(var(--accent))]">
              <UserRoundCheck className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold text-white">No artists followed yet.</h2>
            <p className="text-sm text-white/60">
              Open an artist page and use Follow to start watching for new albums and singles.
            </p>
            <Link
              to="/search"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/80 transition-all hover:border-[rgba(var(--accent),0.3)] hover:bg-[rgba(var(--accent),0.12)] hover:text-[rgb(var(--accent))]"
            >
              Find artists
            </Link>
          </div>
        </Card>
      ) : (
        <StaggeredList className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {artists.map((artist) => (
              <StaggeredItem key={artist.id}>
                <ArtistFollowCard
                  artist={artist}
                  jobs={jobs}
                  onUnfollow={() => unfollow(artist.id)}
                  onQueued={(q) => setQueuedCount(q)}
                />
              </StaggeredItem>
            ))}
          </AnimatePresence>
        </StaggeredList>
      )}
    </div>
  )
}

function ArtistFollowCard({
  artist,
  jobs,
  onUnfollow,
  onQueued,
}: {
  artist: FollowedArtist
  jobs: Job[]
  onUnfollow: () => void
  onQueued: (queued: number) => void
}) {
  const artistJobs = useMemo(() => {
    return jobs.filter((j) => j.artistId === artist.id)
  }, [jobs, artist.id])

  const activeJobs = artistJobs.filter((j) => j.status === 'queued' || j.status === 'running')
  const finishedJobs = artistJobs.filter((j) => j.status === 'done' || j.status === 'failed')
  const totalJobs = activeJobs.length + finishedJobs.length
  const isDownloading = activeJobs.length > 0
  const progressPercent = totalJobs > 0 ? (finishedJobs.length / totalJobs) * 100 : 0

  const art = artworkUrl(artist.artworkTemplate, 300)
  return (
    <motion.div layout transition={{ type: 'spring', stiffness: 380, damping: 32 }} className="h-full">
      <Card hover className="group relative flex h-full flex-col overflow-hidden p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(var(--accent),0.12),transparent_42%)] opacity-80" />
        <div className="relative flex flex-1 flex-col gap-4">
          <div className="flex items-start gap-4">
            <Link
              to={`/artist/${artist.id}`}
              className="h-20 w-20 shrink-0 overflow-hidden rounded-[24px] border border-white/[0.08] bg-black/45 shadow-[0_18px_35px_-22px_rgba(0,0,0,0.9)]"
            >
              {art ? (
                <img src={art} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-white/35">
                  <UserRoundCheck className="h-7 w-7" />
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to={`/artist/${artist.id}`}
                className="line-clamp-2 text-lg font-semibold leading-tight text-white transition-colors hover:text-[rgb(var(--accent))]"
              >
                {artist.name}
              </Link>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {artist.fullyDownloaded ? (
                  <Badge variant="ok">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="warn">
                    {artist.missingReleaseCount} missing
                  </Badge>
                )}
                <Badge>{artist.totalReleaseCount} releases</Badge>
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-white/45">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {artist.lastCheckedAt ? `Checked ${formatRelativeTime(artist.lastCheckedAt)}` : 'Waiting for first check'}
              </div>
              {artist.latestReleaseDate && (
                <div className="mt-1 truncate">Latest release {artist.latestReleaseDate}</div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {isDownloading ? (
                <div className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[rgba(var(--accent),0.25)] bg-[rgba(var(--accent),0.08)] px-3 text-xs font-medium text-[rgb(var(--accent))]">
                  <div className="w-16">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[rgba(var(--accent),0.2)]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[rgb(var(--accent))] transition-[width] duration-300 ease-snappy"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                  <span>{finishedJobs.length}/{totalJobs}</span>
                </div>
              ) : artist.missingReleaseCount > 0 ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.downloadArtistMissingReleases(artist.id)
                      onQueued(res.queued)
                    } catch (err) {
                    }
                  }}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-white/65 transition-colors hover:border-[rgba(var(--accent),0.3)] hover:bg-[rgba(var(--accent),0.12)] hover:text-white"
                >
                  Download missing
                </button>
              ) : null}
              <button
                type="button"
                onClick={onUnfollow}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-white/65 transition-colors hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-200"
              >
                <X className="h-3.5 w-3.5" />
                Unfollow
              </button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function formatRelativeTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 10_000) return 'just now'
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}
