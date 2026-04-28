import type { HealthReport } from '../api/client'
import { cx } from '../lib/cx'
import { Badge } from './Badge'

type Props = {
  health: HealthReport | null
  loading: boolean
  variant?: 'default' | 'shell'
}

export function HealthPill({ health, loading, variant = 'default' }: Props) {
  const shellClass = variant === 'shell' ? 'h-10 px-3.5 text-[0.8125rem] leading-none group-hover:text-accent group-hover:border-[rgba(var(--accent),0.3)] group-hover:bg-[rgba(var(--accent),0.12)]' : ''
  if (loading || !health) {
    return <Badge className={shellClass}>Checking…</Badge>
  }
  if (health.ok) {
    if (health.wrapper?.stallRecent) {
      return (
        <Badge
          variant="warn"
          className={shellClass}
          title="The download wrapper recently stalled and was auto-recovered. The queue is moving normally."
        >
          ● Recovered
        </Badge>
      )
    }
    return <Badge variant="ok" className={shellClass}>● Ready</Badge>
  }
  const wrapperDown =
    !health.wrapper?.decrypt?.ok &&
    !health.wrapper?.m3u8?.ok &&
    !health.wrapper?.account?.ok
  let label = 'Issue'
  let title = 'Something is not ready'
  if (wrapperDown) {
    label = 'Sign in required'
    title = 'Apple Music wrapper is offline — add credentials in Settings.'
  } else if (!health.appleToken?.ok) {
    label = 'Apple token'
    title = 'Could not fetch the public Apple Music bearer token.'
  } else if (!health.music?.ok) {
    label = 'Music folder'
    title = 'Music output folder is not writable.'
  } else {
    const partial: string[] = []
    if (!health.wrapper?.decrypt?.ok) partial.push('decrypt')
    if (!health.wrapper?.m3u8?.ok) partial.push('m3u8')
    if (!health.wrapper?.account?.ok) partial.push('account')
    label = `Wrapper: ${partial.join(', ')}`
    title = label
  }
  return (
    <Badge
      variant="warn"
      className={cx('max-w-[260px] truncate', shellClass)}
      title={title}
    >
      ● {label}
    </Badge>
  )
}
