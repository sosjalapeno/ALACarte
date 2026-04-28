import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home as HomeIcon, Menu, Search as SearchIcon } from 'lucide-react'

import { HealthPill } from './HealthPill'
import { NavDrawer } from './NavDrawer'
import type { HealthReport } from '../api/client'
import { cx } from '../lib/cx'

const ROOT_ROUTES = new Set(['/', '/library'])

type Props = {
  health: HealthReport | null
  loading: boolean
}

export function TopBar({ health, loading }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const atRoot = ROOT_ROUTES.has(location.pathname)
  const isSearch = location.pathname === '/search'
  const isArtist = location.pathname.startsWith('/artist/')
  const isAlbum = location.pathname.startsWith('/album/')
  const isPlaylist = location.pathname.startsWith('/playlist/')
  const isFollowing = location.pathname === '/following'
  const isStatus = location.pathname === '/status'
  const isSettings = location.pathname === '/settings'
  const showHomeShortcut =
    isSearch || isArtist || isStatus || isSettings || isAlbum || isPlaylist || isFollowing
  const showCenterPill =
    location.pathname === '/' || location.pathname === '/library'
  const pageTitle =
    location.pathname === '/search'
      ? 'Search'
      : location.pathname === '/status'
        ? 'Status'
        : location.pathname === '/settings'
          ? 'Settings'
          : location.pathname === '/following'
            ? 'Following'
            : location.pathname.startsWith('/album/')
              ? 'Album'
              : location.pathname.startsWith('/artist/')
                ? 'Artist'
                : ''

  const iconBtn =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent text-white/60 transition-[background,color,transform] duration-[180ms] ease-smooth hover:bg-[rgba(var(--accent),0.12)] hover:text-[rgb(var(--accent))] active:scale-95 disabled:pointer-events-none disabled:opacity-40'

  return (
    <>
      <header className="pointer-events-none sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
        <div className="relative flex items-center gap-2 px-3 py-3 md:gap-3 md:px-6">
          <div className="flex items-center gap-2 pointer-events-auto">
            {!atRoot && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className={iconBtn}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {showHomeShortcut && (
              <Link to="/" className={iconBtn} aria-label="Home">
                <HomeIcon className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={iconBtn}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
            >
              <Menu className="h-4 w-4" />
            </button>
            {!showCenterPill && pageTitle && (
              <span className="ml-1 text-sm font-medium tracking-[0.005em] text-white/55 md:text-base">
                {pageTitle}
              </span>
            )}
          </div>

          {showCenterPill && (
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
              <div
                className="pointer-events-auto inline-flex rounded-full border border-white/[0.08] bg-[rgba(var(--glass-tint),0.55)] p-1 backdrop-blur-[18px] backdrop-saturate-[1.2]"
                role="tablist"
              >
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    cx(
                      'inline-flex items-center gap-1.5 rounded-full px-5 py-1.5 text-sm font-medium text-white/50 transition-[background,color] duration-[180ms] ease-smooth hover:text-[rgb(var(--accent))]',
                      isActive && 'bg-[rgb(var(--accent))] !text-[#0d0d14] font-semibold hover:!text-[#0d0d14]',
                    )
                  }
                >
                  Home
                </NavLink>
                <NavLink
                  to="/library"
                  className={({ isActive }) =>
                    cx(
                      'inline-flex items-center gap-1.5 rounded-full px-5 py-1.5 text-sm font-medium text-white/50 transition-[background,color] duration-[180ms] ease-smooth hover:text-[rgb(var(--accent))]',
                      isActive && 'bg-[rgb(var(--accent))] !text-[#0d0d14] font-semibold hover:!text-[#0d0d14]',
                    )
                  }
                >
                  Library
                </NavLink>
              </div>
            </div>
          )}

          <div className="ml-auto" />

          <div className="flex items-center gap-2 pointer-events-auto">
            <Link to="/search" className={iconBtn} aria-label="Search">
              <SearchIcon className="h-4 w-4" />
            </Link>
            <Link to="/status" aria-label="Open status" className="group hidden md:inline-flex">
              <HealthPill health={health} loading={loading} variant="shell" />
            </Link>
          </div>
        </div>
      </header>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
