import { motion } from 'framer-motion'
import { cx } from '../lib/cx'

type Props = {
  children: React.ReactNode
  className?: string
}

export function PageWrapper({ children, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cx('w-full', className)}
    >
      {children}
    </motion.div>
  )
}
