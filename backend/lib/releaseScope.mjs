export const RELEASE_SCOPE_VALUES = new Set(['everything', 'albums', 'singles_eps'])

export function normalizeReleaseScope(value) {
  const scope = String(value || '').trim()
  return RELEASE_SCOPE_VALUES.has(scope) ? scope : 'everything'
}

export function releaseMatchesScope(release, scope) {
  const normalized = normalizeReleaseScope(scope)
  if (normalized === 'everything') return true
  const single = release?.isSingle === true
  return normalized === 'singles_eps' ? single : !single
}

export function filterReleasesByScope(releases, scope) {
  if (!Array.isArray(releases)) return []
  return releases.filter((release) => releaseMatchesScope(release, scope))
}
