import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { api } from '../api/client'
import { useQueue } from '../hooks/useQueue'
import { QueueItem } from '../components/QueueItem'
import { Card } from '../components/Card'
import { StaggeredList, StaggeredItem } from '../components/StaggeredList'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'

function SkeletonCard() {
  return (
    <Card className="flex items-center gap-3 p-3">
      <motion.div
        className="h-10 w-10 rounded-lg bg-white/10"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="flex-1 min-w-0">
        <motion.div
          className="h-4 bg-white/10 rounded w-2/3 mb-2"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
        />
        <motion.div
          className="h-3 bg-white/10 rounded w-1/2"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
      </div>
    </Card>
  )
}

export function HomePage() {
  const { active, recent, loading } = useQueue()
  const recentList = recent.slice(0, 50)
  const [quality, setQuality] = useState<string | null>(null)
  const [confirmAbortAll, setConfirmAbortAll] = useState(false)
  const [abortingAll, setAbortingAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .settings()
      .then((settings) => {
        if (!cancelled) setQuality(settings.quality)
      })
      .catch(() => {
        if (!cancelled) setQuality(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const subtitle =
    quality === 'alac'
      ? 'Search, pick an album, and download Apple Lossless (ALAC) straight into your music library.'
      : quality === 'atmos'
        ? 'Search, pick an album, and download Dolby Atmos when available, with FLAC fallback.'
        : quality === 'aac'
          ? 'Search, pick an album, and download AAC straight into your music library.'
          : 'Search, pick an album, and download lossless FLAC straight into your music library.'

  return (
    <div className="mx-auto w-full max-w-6xl pt-4 md:pt-6 space-y-8">
      <section>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Good listening
        </h1>
        <p className="text-white/60 max-w-prose mt-1">
          {subtitle}
        </p>
      </section>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="space-y-8"
          >
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-accent" /> Active
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                <SkeletonCard />
              </div>
            </section>
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Recently imported
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-accent" /> Active
                </h2>
                {active.length > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmAbortAll(true)}
                    className="min-h-9 px-3 py-1.5 text-xs text-white/65 hover:border-rose-400/35 hover:bg-rose-500/12 hover:text-rose-200"
                  >
                    <XCircle className="h-4 w-4" />
                    Abort all
                  </Button>
                )}
              </div>
              {active.length === 0 ? (
                <Card className="p-6 text-sm text-white/55">
                  Nothing downloading right now.
                </Card>
              ) : (
                <StaggeredList className="flex flex-col gap-2">
                  {active.map((j) => (
                    <StaggeredItem key={j.id}>
                      <QueueItem job={j} />
                    </StaggeredItem>
                  ))}
                </StaggeredList>
              )}
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Recently imported
                </h2>
              </div>
              {recentList.length === 0 ? (
                <Card className="flex items-center gap-2 p-6 text-sm text-white/55">
                  <AlertCircle className="h-4 w-4" />
                  No completed downloads yet.
                </Card>
              ) : (
                <StaggeredList className="flex flex-col gap-2">
                  {recentList.map((j) => (
                    <StaggeredItem key={j.id}>
                      <QueueItem job={j} />
                    </StaggeredItem>
                  ))}
                </StaggeredList>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={confirmAbortAll}
        onClose={() => {
          if (!abortingAll) setConfirmAbortAll(false)
        }}
        placement="center"
        label="Abort all downloads"
        className="!max-w-[26rem]"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/12 text-rose-200">
              <XCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">Abort active downloads?</h3>
              <p className="mt-1 text-sm text-white/60">
                This will cancel {active.length} queued or running download{active.length === 1 ? '' : 's'}. Completed history is kept.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmAbortAll(false)}
              disabled={abortingAll}
            >
              Keep downloading
            </Button>
            <Button
              onClick={async () => {
                setAbortingAll(true)
                try {
                  await api.cancelAll()
                  setConfirmAbortAll(false)
                } finally {
                  setAbortingAll(false)
                }
              }}
              disabled={abortingAll || active.length === 0}
              className="border-rose-400/35 bg-rose-500/14 text-rose-100 hover:border-rose-300/45 hover:bg-rose-500/22 hover:text-white"
            >
              <XCircle className="h-4 w-4" />
              {abortingAll ? 'Aborting…' : `Abort ${active.length}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
