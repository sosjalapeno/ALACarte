import { useMemo, useState } from 'react'
import { Check, Download, Loader2, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'

import type { Job } from '../api/client'
import { cx } from '../lib/cx'

export type DownloadState = 'idle' | 'queued' | 'running' | 'done' | 'failed'

type Props = {
  onStart: () => Promise<unknown>
  job?: Job | null
  size?: 'sm' | 'md'
  ariaLabel?: string
  className?: string
  blocked?: boolean
}
export function DownloadButton({
  onStart,
  job,
  size = 'md',
  ariaLabel,
  className = '',
  blocked = false,
}: Props) {
  const [localState, setLocalState] = useState<DownloadState>('idle')
  const [error, setError] = useState<string | null>(null)

  const state: DownloadState = useMemo(() => {
    if (localState === 'failed') return 'failed'
    if (job) {
      if (job.status === 'queued') return 'queued'
      if (job.status === 'running') return 'running'
      if (job.status === 'done') return 'done'
      if (job.status === 'failed') return 'failed'
    }
    return localState
  }, [blocked, job, localState])

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (state === 'queued' || state === 'running') return
    if (blocked || state === 'done') return
    setLocalState('queued')
    setError(null)
    try {
      const started = await onStart()
      if (started === false) {
        setLocalState('idle')
      }
    } catch (err: any) {
      setLocalState('failed')
      setError(err?.message || 'Failed')
      setTimeout(() => setLocalState('idle'), 3000)
    }
  }

  const Icon =
    blocked || state === 'done'
      ? Check
      : state === 'failed'
        ? AlertCircle
        : state === 'queued' || state === 'running'
          ? Loader2
          : Download

  const iconClass =
    state === 'queued' || state === 'running' ? 'animate-spin' : ''

  const title =
    blocked
      ? 'Already in library'
      : state === 'done'
      ? 'Downloaded'
      : state === 'failed'
        ? error || 'Failed'
        : state === 'running'
          ? `Downloading…`
          : state === 'queued'
            ? 'Queued'
            : 'Download'

  const progress = state === 'running' && job ? Math.min(100, Math.max(0, job.progress)) : null

  return (
    <motion.button
      type="button"
      whileTap={!blocked && state !== 'queued' && state !== 'running' ? { scale: 0.95 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleClick}
      aria-label={!blocked && state === 'idle' ? ariaLabel ?? title : title}
      title={title}
      data-state={blocked ? 'blocked' : state}
      disabled={blocked || state === 'queued' || state === 'running'}
      className={cx(
        'relative inline-flex items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] text-white/90 backdrop-blur-[10px] transform-gpu transition-[background,border-color,color,box-shadow,transform] duration-[400ms] ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.35)] disabled:cursor-default',
        !blocked && state !== 'queued' && state !== 'running' && state !== 'done' && state !== 'failed' && 'hover:bg-[rgba(var(--accent),0.12)] hover:border-[rgba(var(--accent),0.25)] hover:text-[rgb(var(--accent))]',
        size === 'sm' ? 'h-[30px] w-[30px]' : 'h-9 w-9',
        blocked
          ? 'border-emerald-400/35 bg-emerald-500/14 text-emerald-200/85 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
          : state === 'queued' || state === 'running'
          ? 'border-accent/55 bg-accent/[0.28] text-white'
          : state === 'done'
            ? 'border-emerald-400/55 bg-emerald-500/22 text-emerald-300'
            : state === 'failed'
              ? 'border-rose-400/55 bg-rose-500/22 text-rose-300'
              : '',
        className,
      )}
    >
      {progress !== null ? (
        <ProgressRing
          percent={progress}
          size={size === 'sm' ? 26 : 32}
        />
      ) : null}
      <Icon
        className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${iconClass} ${progress !== null ? 'absolute' : ''}`}
        strokeWidth={2.25}
      />
    </motion.button>
  )
}

function ProgressRing({ percent, size }: { percent: number; size: number }) {
  const stroke = 2
  const r = size / 2 - stroke
  const c = 2 * Math.PI * r
  const offset = c - (percent / 100) * c
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-300 ease-snappy"
      />
    </svg>
  )
}
