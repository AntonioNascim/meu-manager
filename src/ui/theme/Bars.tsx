/**
 * Barra segmentada: `total` quadradinhos, os `lit` primeiros acesos (a zona da meta), `current` em destaque
 * (1 a total) e uma linha na borda direita do `marker`. Serve para a posição na tabela (1 a 20).
 */
export function SegmentedBar({ total, lit = 0, current, marker, label }: { total: number; lit?: number; current?: number; marker?: number; label: string }) {
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const style = n === current ? 'bg-accent ring-2 ring-accent/50 ring-offset-1 ring-offset-surface' : n <= lit ? 'bg-accent/40' : 'bg-surface-2'
        return (
          <span key={n} className="relative h-4 min-w-0 flex-1">
            <span className={`absolute inset-0 rounded-[3px] ${style}`} />
            {n === marker && <span className="absolute -bottom-1 -right-[3px] -top-1 w-0.5 rounded bg-white" />}
          </span>
        )
      })}
    </div>
  )
}

const FILLS = {
  accent: 'bg-accent',
  striped: 'bg-pink-400/70 stripes-fine',
  warning: 'bg-amber-400',
  danger: 'bg-loss',
} as const

/** Barra de progresso de 0 a 100. */
export function ProgressBar({ value, tone = 'accent', height = 'h-3', label }: { value: number; tone?: keyof typeof FILLS; height?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`${height} overflow-hidden rounded-full bg-surface-2`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${FILLS[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
