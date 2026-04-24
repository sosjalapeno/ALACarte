import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { motion, AnimatePresence } from 'framer-motion'

type Props = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  label?: string
  placement?: 'top' | 'center'
}

export function Modal({
  open,
  onClose,
  children,
  className,
  label,
  placement = 'top',
}: Props) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <div
            className={cx(
              'fixed inset-0 z-[60] flex justify-center overflow-y-auto px-4 pb-8',
              placement === 'center'
                ? 'items-center pt-8 md:pt-8'
                : 'items-start pt-16 md:pt-24',
            )}
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={cx(
                'pointer-events-auto relative mx-auto w-full max-w-[44rem] rounded-[20px] border border-white/10 bg-[rgba(18,18,24,0.94)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-[24px] backdrop-saturate-[1.25]',
                className,
              )}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
