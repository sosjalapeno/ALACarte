import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Lock,
  Key,
  Globe,
  FolderOpen,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { api, type PublicSettings } from '../api/client'
import { setAppSettingsCache } from '../hooks/useAppSettings'
import { useEventStream } from '../hooks/useEventStream'

import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { StaggeredList, StaggeredItem } from '../components/StaggeredList'


const STOREFRONTS = [
  ['us', 'United States'],
  ['gb', 'United Kingdom'],
  ['de', 'Germany'],
  ['fr', 'France'],
  ['jp', 'Japan'],
  ['ca', 'Canada'],
  ['au', 'Australia'],
  ['it', 'Italy'],
  ['es', 'Spain'],
  ['nl', 'Netherlands'],
  ['pl', 'Poland'],
  ['ru', 'Russia'],
  ['br', 'Brazil'],
  ['mx', 'Mexico'],
  ['kr', 'South Korea'],
  ['tr', 'Turkey'],
] as const

export function SettingsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const flashTimeoutRef = useRef<number | null>(null)

  const reload = () =>
    api
      .settings()
      .then((s) => {
        setSettings(s)
        setAppSettingsCache(s)
      })
      .catch(() => {})
  useEffect(() => {
    reload()
  }, [])

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current)
      }
    }
  }, [])

  const update = async (patch: Partial<PublicSettings>) => {
    if (!settings) return
    setSettings({ ...settings, ...patch } as PublicSettings)
    try {
      const next = await api.saveSettings(patch)
      setSettings(next)
      setAppSettingsCache(next)
      flash('Saved')
    } catch (err: any) {
      flash(`Error: ${err.message}`, true)
    }
  }

  const flash = (msg: string, _err = false) => {
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current)
    }
    setMessage(msg)
    flashTimeoutRef.current = window.setTimeout(() => {
      setMessage(null)
      flashTimeoutRef.current = null
    }, 2500)
  }

  if (!settings) {
    return null
  }

  return (
    <>
      <AnimatePresence>
        {message && (
          <motion.div
            key="settings-flash"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
          >
            <Badge className="h-10 px-3.5 text-[0.8125rem] leading-none">
              {message}
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>

      <StaggeredList className="mx-auto w-full max-w-3xl space-y-6 pt-4 md:pt-6">
        <StaggeredItem>
          <SettingsCard icon={<Lock className="h-4 w-4" />} title="Apple ID credentials">
            <AppleCredsForm
              settings={settings}
              onChange={reload}
              disabled={saving}
              setSaving={setSaving}
            />
          </SettingsCard>
        </StaggeredItem>

        <StaggeredItem>
          <SettingsCard icon={<Key className="h-4 w-4" />} title="media-user-token">
            <MediaUserTokenForm settings={settings} onChange={reload} />
          </SettingsCard>
        </StaggeredItem>

        <StaggeredItem>
          <SettingsCard icon={<Globe className="h-4 w-4" />} title="Catalog">
            <div className="space-y-4">
              <label className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
                <span className="text-sm text-white/70 md:w-32">Storefront</span>
                <select
                  value={settings.storefront}
                  onChange={(e) => update({ storefront: e.target.value })}
                  className="w-full rounded-app border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-white outline-none transition-[border-color,background,box-shadow] duration-[250ms] ease-smooth focus:border-[rgba(var(--accent),0.45)] focus:bg-[rgba(var(--accent),0.04)] focus:shadow-[0_0_0_3px_rgba(var(--accent),0.18)] md:flex-1"
                >
                  {STOREFRONTS.map(([v, label]) => (
                    <option key={v} value={v} className="bg-zinc-900">
                      {label} ({v.toUpperCase()})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 md:flex-row md:items-start md:gap-3">
                <span className="text-sm text-white/70 md:w-32 md:pt-2">
                  Content rating
                </span>
                <div className="md:flex-1">
                  <select
                    value={settings.explicitFilter}
                    onChange={(e) =>
                      update({
                        explicitFilter: e.target
                          .value as PublicSettings['explicitFilter'],
                      })
                    }
                    className="w-full rounded-app border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-white outline-none transition-[border-color,background,box-shadow] duration-[250ms] ease-smooth focus:border-[rgba(var(--accent),0.45)] focus:bg-[rgba(var(--accent),0.04)] focus:shadow-[0_0_0_3px_rgba(var(--accent),0.18)]"
                  >
                    <option value="explicit" className="bg-zinc-900">
                      Prefer explicit
                    </option>
                    <option value="clean" className="bg-zinc-900">
                      Prefer clean
                    </option>
                    <option value="both" className="bg-zinc-900">
                      Show both
                    </option>
                  </select>
                  <div className="mt-1 text-xs text-white/50">
                    Apple often lists explicit and clean masters as separate
                    albums. "Prefer" still falls back to the other when only one
                    version exists.
                  </div>
                </div>
              </label>
            </div>
          </SettingsCard>
        </StaggeredItem>

        <StaggeredItem>
          <SettingsCard icon={<FolderOpen className="h-4 w-4" />} title="Library output">
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.convertToFlac}
                  onChange={(e) => update({ convertToFlac: e.target.checked })}
                  className="mt-0.5 shrink-0 focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div>
                  <div className="text-sm font-medium">
                    Convert ALAC → FLAC after download
                  </div>
                  <div className="mt-0.5 text-xs text-white/55">
                    Uses ffmpeg. Same lossless quality.
                  </div>
                </div>
              </label>
              <label
                className={`flex items-start gap-3 ${
                  settings.hasMediaUserToken ? 'cursor-pointer' : 'cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={settings.downloadLyrics}
                  onChange={(e) => update({ downloadLyrics: e.target.checked })}
                  className="mt-0.5 shrink-0 focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent),0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!settings.hasMediaUserToken}
                />
                <div>
                  <div
                    className={`text-sm font-medium ${
                      settings.hasMediaUserToken ? '' : 'text-white/45'
                    }`}
                  >
                    Download lyrics
                  </div>
                  <div className="mt-0.5 text-xs text-white/55">
                    Saves embedded lyrics and sidecar <code className="text-accent">.lrc</code>{' '}
                    files for supported players. Requires a media-user-token.
                  </div>
                </div>
              </label>
              <label className="flex flex-col gap-1.5 md:flex-row md:items-start md:gap-3">
                <span className="text-sm text-white/70 md:w-32 md:pt-2">
                  Cover size
                </span>
                <div className="md:flex-1">
                  <select
                    value={settings.coverSize}
                    onChange={(e) => update({ coverSize: e.target.value })}
                    className="w-full rounded-app border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-white outline-none transition-[border-color,background,box-shadow] duration-[250ms] ease-smooth focus:border-[rgba(var(--accent),0.45)] focus:bg-[rgba(var(--accent),0.04)] focus:shadow-[0_0_0_3px_rgba(var(--accent),0.18)]"
                  >
                    <option value="1400x1400" className="bg-zinc-900">1400×1400 (recommended)</option>
                    <option value="2000x2000" className="bg-zinc-900">2000×2000</option>
                    <option value="3000x3000" className="bg-zinc-900">3000×3000</option>
                    <option value="5000x5000" className="bg-zinc-900">5000×5000 (max, large)</option>
                  </select>
                  <div className="mt-1 text-xs text-white/50">
                    Used for both embedded cover and folder.jpg.
                  </div>
                </div>
              </label>
            </div>
          </SettingsCard>
        </StaggeredItem>

        <StaggeredItem>
          <footer className="pb-1 pt-1 text-center text-xs text-white/45">
            Built by{' '}
            <a
              href="https://github.com/sosjalapeno"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-white underline decoration-accent/50 underline-offset-2"
            >
              sosjalapeno
            </a>
          </footer>
        </StaggeredItem>
      </StaggeredList>
    </>
  )
}

function SettingsCard({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="p-5 md:p-6">
      <header className="flex items-center gap-2 mb-4">
        {icon && <span className="text-accent">{icon}</span>}
        <h2 className="text-base font-semibold">{title}</h2>
      </header>
      {children}
    </Card>
  )
}

type LoginPhase =
  | 'idle'
  | 'preparing'
  | 'creating'
  | 'signing-in'
  | '2fa-required'
  | 'verifying-2fa'
  | 'starting-main'
  | 'ready'
  | 'failed'

function phaseLabel(p: LoginPhase): string {
  switch (p) {
    case 'preparing': return 'Preparing sign-in…'
    case 'creating': return 'Preparing secure container…'
    case 'signing-in': return 'Signing in to Apple Music — this can take up to 90 seconds'
    case '2fa-required': return 'Waiting for your 2FA code'
    case 'verifying-2fa': return 'Verifying 2FA code…'
    case 'starting-main': return 'Starting Apple Music wrapper…'
    case 'ready': return 'Signed in successfully. Ready to download.'
    case 'failed': return 'Sign-in failed'
    default: return ''
  }
}

function AppleCredsForm({
  settings, onChange, disabled, setSaving,
}: {
  settings: PublicSettings
  onChange: () => void
  disabled: boolean
  setSaving: (b: boolean) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<LoginPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showTwoFa, setShowTwoFa] = useState(false)

  useEventStream((type, data) => {
    if (type !== 'wrapper.login') return
    if (!data?.phase) return
    setPhase(data.phase as LoginPhase)
    if (data.phase === '2fa-required') {
      setShowTwoFa(true)
    } else if (data.phase === 'ready' || data.phase === 'failed' || data.phase === 'verifying-2fa') {
      setShowTwoFa(false)
    }
    if (data.phase === 'failed') {
      setError(data.error || 'Sign-in failed')
      setSaving(false)
    }
    if (data.phase === 'ready') {
      setError(null)
      setSaving(false)
      onChange()
    }
  })

  const busy = phase !== 'idle' && phase !== 'ready' && phase !== 'failed'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setError(null)
    setPhase('preparing')
    setSaving(true)
    try {
      const r = await api.saveAppleCreds(email, password, true)
      if (!r.loginStarted) {
        setError(r.loginError || 'Could not start sign-in')
        setPhase('failed')
        setSaving(false)
        return
      }
      onChange()
    } catch (err: any) {
      setError(err?.message || 'Failed')
      setPhase('failed')
      setSaving(false)
    }
  }

  const clear = async () => {
    await api.clearAppleCreds()
    setPhase('idle')
    setError(null)
    onChange()
  }

  const retryLogin = async () => {
    setError(null)
    setPhase('preparing')
    setSaving(true)
    try {
      await api.runAppleLogin()
    } catch (err: any) {
      setError(err?.message || 'Failed')
      setPhase('failed')
      setSaving(false)
    }
  }

  const cancel = async () => {
    try {
      await api.cancelAppleLogin()
    } finally {
      setPhase('idle')
      setShowTwoFa(false)
      setSaving(false)
    }
  }

  useEffect(() => {
    if (phase === 'ready') {
      setEmail('')
      setPassword('')
    }
  }, [phase])

  const hardBlocked = Boolean(settings.hardBlockReason)

  return (
    <>
      <form className="space-y-3" onSubmit={save}>
        {hardBlocked && (
          <div className="rounded-app border border-rose-400/40 bg-rose-500/[0.08] p-4 space-y-2">
            <div className="flex items-center gap-2 text-rose-300 font-semibold">
              <AlertCircle className="h-4 w-4" />
              Apple Account locked
            </div>
            <div className="text-sm text-white/80">{settings.hardBlockReason}</div>
            <ol className="text-sm text-white/70 list-decimal pl-5 space-y-1">
              <li>
                Reset your password at{' '}
                <a href="https://iforgot.apple.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">iforgot.apple.com</a>.
              </li>
              <li>Sign in once with the new password on a trusted Apple device so Apple trusts the account again.</li>
              <li>Wait a few minutes, then come back here, click <em>Clear</em>, and enter the new credentials.</li>
            </ol>
            <p className="text-xs text-white/50">
              Retrying without doing the above will only deepen the lockout — this is Apple's anti-abuse protection, not a bug here.
            </p>
          </div>
        )}

        {settings.hasAppleCreds ? (
          <div className="text-sm text-white/70">
            Current: <span className="text-white">{settings.appleEmailMasked}</span>
          </div>
        ) : (
          <div className="text-sm text-white/55">
            No credentials stored. Enter your Apple ID used for Apple Music.
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          <Input type="email" placeholder="Apple ID email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          <Input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </div>
        <div className="flex gap-2 flex-wrap min-h-[40px]">
          <AnimatePresence initial={false} mode="popLayout">
            {(busy || (email && password && !hardBlocked) || !settings.hasAppleCreds) && (
              <motion.div
                key="save"
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <Button
                  type="submit"
                  disabled={disabled || busy || !email || !password || hardBlocked}
                  title={hardBlocked ? 'Clear the lockout first' : 'Save credentials'}
                >
                  {busy ? 'Signing in…' : 'Save & sign in'}
                </Button>
              </motion.div>
            )}
            {settings.hasAppleCreds && !busy && (
              <motion.div
                key="creds-actions"
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex gap-2"
              >
                {!hardBlocked && <Button onClick={retryLogin}>Re-run sign in</Button>}
                <Button onClick={clear}>Clear</Button>
              </motion.div>
            )}
            {busy && (
              <motion.div
                key="cancel"
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <Button onClick={cancel}>Cancel</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <Badge variant="bad" className="max-w-full">
            <span className="truncate">{error}</span>
          </Badge>
        )}
        {!error && phase !== 'idle' && phase !== 'failed' && (
          <Badge variant={phase === 'ready' ? 'ok' : 'accent'} className="max-w-full">
            <span className="truncate">{phaseLabel(phase)}</span>
          </Badge>
        )}
        <p className="text-xs text-white/50">
          Encrypted at rest. Password never touches a shell or log.
        </p>
      </form>
      {showTwoFa && (
        <TwoFaModal onClose={() => setShowTwoFa(false)} onCancel={cancel} />
      )}
    </>
  )
}

function TwoFaModal({ onClose, onCancel }: { onClose: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = code.replace(/\D/g, '')
    if (cleaned.length < 4) {
      setErr('Enter the 6-digit code Apple showed on your trusted device')
      return
    }
    setErr(null)
    setSubmitting(true)
    try {
      await api.submitAppleTwoFa(cleaned)
      onClose()
    } catch (e: any) {
      setErr(e?.message || 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={true} onClose={onCancel} className="max-w-sm p-6" label="Two-factor code">
      <h3 className="text-lg font-semibold mb-1">Two-factor code</h3>
      <p className="text-sm text-white/60 mb-4">
        Apple sent a 6-digit verification code to your trusted devices.
        Enter it below to complete sign-in.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input
          ref={inputRef}
          inputMode="numeric"
          pattern="\d*"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="••••••"
          className="tracking-[0.5em] text-center text-xl"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={submitting}
        />
        {err && (
          <Badge variant="bad" className="max-w-full">
            <span className="truncate">{err}</span>
          </Badge>
        )}
        <div className="flex gap-2 justify-end">
          <Button onClick={onCancel} disabled={submitting}>Cancel sign-in</Button>
          <Button type="submit" disabled={submitting || code.length < 4}>
            {submitting ? 'Verifying…' : 'Verify'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function MediaUserTokenForm({ settings, onChange }: { settings: PublicSettings; onChange: () => void }) {
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    try {
      await api.saveMediaUserToken(token)
      setToken('')
      setMsg('Saved.')
      onChange()
    } catch (err: any) {
      setMsg(`Error: ${err.message}`)
    }
  }
  const clear = async () => {
    await api.clearMediaUserToken()
    setMsg('Cleared.')
    onChange()
  }

  return (
    <form className="space-y-3" onSubmit={save}>
      <div className="text-sm text-white/55">
        Optional. Needed for lyrics — when present, both embedded lyrics and a
        sidecar <code className="text-accent">.lrc</code> file are saved so
        compatible media servers and players can pick them up automatically.{' '}
        <span className="text-white/70">
          DevTools → Application → Cookies → music.apple.com → copy{' '}
          <code className="text-accent">media-user-token</code>.
        </span>
      </div>
      {settings.hasMediaUserToken && (
        <div className="text-sm text-emerald-400">Currently stored.</div>
      )}
      <Input type="password" placeholder="Paste media-user-token" value={token} onChange={(e) => setToken(e.target.value)} />
      <div className="flex gap-2 flex-wrap min-h-[40px]">
        <AnimatePresence initial={false} mode="popLayout">
          {token && (
            <motion.div
              key="save"
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <Button type="submit">Save token</Button>
            </motion.div>
          )}
          {settings.hasMediaUserToken && (
            <motion.div
              key="clear"
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <Button onClick={clear}>Clear</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {msg && <div className="text-xs text-white/60">{msg}</div>}
    </form>
  )
}
