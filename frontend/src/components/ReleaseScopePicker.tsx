import type { ReleaseScope } from '../api/client'
import { cx } from '../lib/cx'

export const RELEASE_SCOPE_OPTIONS: Array<{ value: ReleaseScope; label: string; hint: string }> = [
  { value: 'everything', label: 'Everything', hint: 'Albums, singles, and EPs' },
  { value: 'albums', label: 'Albums', hint: 'Full albums only' },
  { value: 'singles_eps', label: 'Singles & EPs', hint: 'Short-form releases only' },
]

type Props = {
  value: ReleaseScope
  onChange: (value: ReleaseScope) => void
  compact?: boolean
  disabled?: boolean
  className?: string
}

export function ReleaseScopePicker({ value, onChange, compact = false, disabled = false, className }: Props) {
  return (
    <div
      className={cx(
        compact ? 'inline-flex flex-wrap gap-1 rounded-full border border-white/[0.08] bg-white/[0.035] p-1' : 'grid gap-2',
        className,
      )}
      role="radiogroup"
      aria-label="Release scope"
    >
      {RELEASE_SCOPE_OPTIONS.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              compact
                ? 'h-7 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:opacity-60'
                : 'flex w-full items-start gap-3 rounded-app border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
              selected
                ? compact
                  ? 'bg-[rgba(var(--accent),0.18)] text-[rgb(var(--accent))]'
                  : 'border-[rgba(var(--accent),0.45)] bg-[rgba(var(--accent),0.14)] text-white'
                : compact
                  ? 'text-white/55 hover:bg-white/[0.06] hover:text-white/80'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/80 hover:border-white/15 hover:bg-white/[0.07]',
            )}
          >
            {compact ? (
              option.label
            ) : (
              <>
                <span
                  className={cx(
                    'mt-1 h-3.5 w-3.5 shrink-0 rounded-full border',
                    selected
                      ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]'
                      : 'border-white/25 bg-black/20',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-white/50">{option.hint}</span>
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function releaseScopeLabel(value: ReleaseScope) {
  return RELEASE_SCOPE_OPTIONS.find((option) => option.value === value)?.label || 'Everything'
}
