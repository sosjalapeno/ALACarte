export function stripYear(title: string | null | undefined): string {
  if (!title) return ''
  return String(title)
    .replace(/\s*[([]\d{4}[)\]]\s*$/, '')
    .trim()
}

export function formatPercent(value: number | null | undefined): string {
  const v = Number.isFinite(value) ? Number(value) : 0
  const clamped = Math.max(0, Math.min(100, Math.round(v)))
  return `${clamped}%`
}
