import { motion } from 'framer-motion'
import { cx } from '../lib/cx'

type Props = {
  hover?: boolean
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>

export function Card({ hover, className, children, ...rest }: Props) {
  const Comp = hover ? motion.div : 'div'
  const hoverProps = hover
    ? {
        whileHover: { scale: 1.015, y: -2 },
        transition: { type: 'spring', stiffness: 400, damping: 25 },
      }
    : {}

  return (
    <Comp
      className={cx(
        'rounded-app border border-white/[0.08] bg-white/[0.04] overflow-hidden transition-[background,border-color] duration-[400ms] ease-smooth',
        hover && 'hover:bg-[rgba(var(--accent),0.08)] hover:border-[rgba(var(--accent),0.25)]',
        className,
      )}
      {...hoverProps}
      {...(rest as any)}
    >
      {children}
    </Comp>
  )
}

