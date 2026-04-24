import { motion, type Variants } from 'framer-motion'

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const item: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 },
  },
}

type Props = {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function StaggeredList({ children, className, style }: Props) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function StaggeredItem({ children, className, style }: Props) {
  return (
    <motion.div variants={item} className={className} style={style}>
      {children}
    </motion.div>
  )
}
