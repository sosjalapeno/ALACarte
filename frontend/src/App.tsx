import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { HomePage } from './pages/Home'
import { SearchPage } from './pages/Search'
import { LibraryPage } from './pages/Library'
import { AlbumPage } from './pages/Album'
import { ArtistPage } from './pages/Artist'
import { StatusPage } from './pages/Status'
import { SettingsPage } from './pages/Settings'
import { TopBar } from './components/TopBar'
import { HealthPill } from './components/HealthPill'
import { PageWrapper } from './components/PageWrapper'
import { AuthScreen } from './components/AuthScreen'
import { useHealth } from './hooks/useHealth'
import { api, type AuthState, setUnauthorizedHandler } from './api/client'

type AuthLimits = {
  minPasswordLength: number
  usernameMinLength: number
  usernameMaxLength: number
}

type AuthGate =
  | { status: 'loading' }
  | ({ status: 'setup'; requiresSetupToken: boolean } & AuthLimits)
  | ({ status: 'login' } & AuthLimits)
  | { status: 'authed' }

const DEFAULT_LIMITS: AuthLimits = {
  minPasswordLength: 12,
  usernameMinLength: 2,
  usernameMaxLength: 32,
}

function limitsFromState(state: AuthState): AuthLimits {
  return {
    minPasswordLength: state.minPasswordLength ?? DEFAULT_LIMITS.minPasswordLength,
    usernameMinLength: state.usernameMinLength ?? DEFAULT_LIMITS.usernameMinLength,
    usernameMaxLength: state.usernameMaxLength ?? DEFAULT_LIMITS.usernameMaxLength,
  }
}

export default function App() {
  const [gate, setGate] = useState<AuthGate>({ status: 'loading' })
  const [bootError, setBootError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setBootError(null)
      const state: AuthState = await api.authState()
      if (state.authDisabled || state.authed) {
        setGate({ status: 'authed' })
        return
      }
      if (!state.passwordSet) {
        setGate({
          status: 'setup',
          requiresSetupToken: Boolean(state.requiresSetupToken),
          ...limitsFromState(state),
        })
        return
      }
      // Password is set but the session cookie isn't valid — show login
      // before any authed UI gets a chance to render.
      setGate({ status: 'login', ...limitsFromState(state) })
    } catch (err) {
      setBootError(err instanceof Error ? err.message : 'Unable to reach authentication service')
      setGate({ status: 'loading' })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    setUnauthorizedHandler(({ needsSetup }) => {
      setGate((prev) =>
        prev.status === 'setup' || prev.status === 'login'
          ? prev
          : needsSetup
            ? { status: 'setup', requiresSetupToken: false, ...DEFAULT_LIMITS }
            : { status: 'login', ...DEFAULT_LIMITS },
      )
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  if (gate.status === 'loading') {
    return (
      <div className="min-h-dvh w-full bg-[var(--bg)] flex items-center justify-center px-4">
        {bootError ? (
          <div className="w-full max-w-md rounded-app border border-white/10 bg-white/[0.03] p-5 text-center space-y-3">
            <p className="text-sm text-rose-300">Couldn’t load authentication state.</p>
            <p className="text-xs text-white/60 break-words">{bootError}</p>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-white/85 hover:border-[rgba(var(--accent),0.3)] hover:text-[rgb(var(--accent))]"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
        )}
      </div>
    )
  }
  if (gate.status === 'setup' || gate.status === 'login') {
    return (
      <AnimatePresence mode="wait">
        <AuthScreen
          mode={gate.status}
          minPasswordLength={gate.minPasswordLength}
          usernameMinLength={gate.usernameMinLength}
          usernameMaxLength={gate.usernameMaxLength}
          requiresSetupToken={gate.status === 'setup' ? gate.requiresSetupToken : false}
          onAuthenticated={() => setGate({ status: 'authed' })}
        />
      </AnimatePresence>
    )
  }

  return <AuthedApp />
}

function AuthedApp() {
  const { health, loading } = useHealth()
  const location = useLocation()

  return (
    <div className="min-h-dvh w-full flex flex-col">
      <TopBar health={health} loading={loading} />

      <AnimatePresence>
        {location.pathname !== '/settings' && location.pathname !== '/status' && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden pointer-events-none">
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="shadow-2xl rounded-full pointer-events-auto"
            >
              <Link to="/status" aria-label="Open status" className="block transition-transform duration-[400ms] ease-smooth hover:scale-[1.03] active:scale-95 group">
                <HealthPill health={health} loading={loading} variant="shell" />
              </Link>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 px-4 md:px-8 pb-8">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<PageWrapper><HomePage /></PageWrapper>} />
              <Route path="/search" element={<PageWrapper><SearchPage /></PageWrapper>} />
              <Route path="/library" element={<PageWrapper><LibraryPage /></PageWrapper>} />
              <Route path="/album/:id" element={<PageWrapper><AlbumPage /></PageWrapper>} />
              <Route path="/artist/:id" element={<PageWrapper><ArtistPage /></PageWrapper>} />
              <Route path="/status" element={<PageWrapper><StatusPage /></PageWrapper>} />
              <Route path="/settings" element={<PageWrapper><SettingsPage /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
