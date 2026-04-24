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
import { useHealth } from './hooks/useHealth'

export default function App() {
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
