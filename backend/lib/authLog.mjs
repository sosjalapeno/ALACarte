export function logAuth(event, details = {}) {
  console.log('[auth]', event, JSON.stringify(details))
}
