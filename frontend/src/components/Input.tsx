import { forwardRef } from 'react'
import { cx } from '../lib/cx'

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  className?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cx(
        'w-full rounded-app border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/30 outline-none',
        'transition-[border-color,background,box-shadow] duration-[250ms] ease-smooth',
        'focus:border-[rgba(var(--accent),0.45)] focus:bg-[rgba(var(--accent),0.04)] focus:shadow-[0_0_0_3px_rgba(var(--accent),0.18)]',
        className,
      )}
      {...rest}
    />
  ),
)
