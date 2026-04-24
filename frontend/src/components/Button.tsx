import { motion } from 'framer-motion'
import { cx } from '../lib/cx'

type Props = {
  variant?: 'accent' | 'ghost'
  className?: string
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

export function Button({
  variant = 'accent',
  className,
  children,
  ...rest
}: Props) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cx(
        'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all',
        'border border-white/10 bg-white/[0.06] text-white/80',
        'hover:border-[rgba(var(--accent),0.3)] hover:bg-[rgba(var(--accent),0.12)] hover:text-[rgb(var(--accent))]',
        className,
      )}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  )
}

