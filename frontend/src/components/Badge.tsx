import { cx } from '../lib/cx'

type Variant = 'accent' | 'ok' | 'bad' | 'warn'

const variantClasses: Record<Variant, string> = {
  accent:
    'border-[rgba(var(--accent),0.25)] bg-[rgba(var(--accent),0.12)] text-[rgb(var(--accent))]',
  ok: 'border-emerald-400/35 bg-emerald-500/[0.18] text-emerald-400',
  bad: 'border-rose-400/35 bg-rose-500/[0.18] text-rose-400',
  warn: 'border-amber-400/35 bg-amber-500/[0.18] text-amber-400',
}

type Props = {
  variant?: Variant
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'className'>

export function Badge({
  variant = 'accent',
  className,
  children,
  ...rest
}: Props) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-[200ms] ease-smooth',
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
