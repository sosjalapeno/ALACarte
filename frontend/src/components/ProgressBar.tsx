type Props = {
  value: number
  label?: string
}

export function ProgressBar({ value, label }: Props) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div className="w-full">
      {label ? (
        <div className="mb-1.5 flex text-xs text-white/60">
          <span className="truncate">{label}</span>
        </div>
      ) : null}
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-indicator/60"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        role="progressbar"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[rgb(var(--accent))] transition-[width] duration-300 ease-snappy"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  )
}
