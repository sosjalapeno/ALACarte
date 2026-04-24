import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  Home as HomeIcon,
  Search as SearchIcon,
  Library as LibraryIcon,
  Settings2,
} from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
}

export function NavDrawer({ open, onClose }: Props) {
  const location = useLocation()
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

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

  const onTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
  }

  const onTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const start = touchStartX.current
    touchStartX.current = null
    if (start == null) return
    const end = e.changedTouches[0]?.clientX ?? start
    if (start - end > 60) onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[70] bg-black/35"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            initial={{ x: 'calc(-100% - 16px)', opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 'calc(-100% - 16px)', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-4 top-6 z-[80] flex w-[min(320px,84vw)] flex-col overflow-y-auto rounded-[32px] border border-white/[0.06] bg-[rgba(var(--glass-tint),0.62)] p-[1.25rem_0.9rem_1.5rem] shadow-[0_4px_30px_rgba(0,0,0,0.1),24px_12px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-[18px] backdrop-saturate-[1.2]"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <DrawerRow to="/" end icon={HomeIcon} label="Home" />

            <div className="mb-1 mt-4 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/40">
              Browse
            </div>
            <DrawerRow to="/search" icon={SearchIcon} label="Search" />
            <DrawerRow to="/library" icon={LibraryIcon} label="Library" />

            <div className="mb-1 mt-4 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/40">
              System
            </div>
            <DrawerRow to="/status" icon={Activity} label="Status" />
            <DrawerRow to="/settings" icon={Settings2} label="Settings" />
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function DrawerRow({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string
  end?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="group flex items-center gap-3 rounded-[14px] px-3 py-2 text-[0.95rem] font-medium text-white/80 transition-[background,color] duration-[160ms] ease-smooth hover:bg-[rgb(var(--accent))] hover:text-[#0a0a0a]"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/85 transition-[background,color] duration-[160ms] ease-smooth group-hover:bg-black/15 group-hover:text-[#0a0a0a]">
        <Icon className="h-4 w-4" />
      </span>
      <span>{label}</span>
    </NavLink>
  )
}