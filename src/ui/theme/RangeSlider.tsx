/**
 * Faixa com duas alças (mínimo e máximo) sobre uma lista de passos. `low` e `high` são índices em `steps`;
 * a alça na ponta (índice 0 ou o último) significa "sem limite" daquele lado.
 */
export function RangeSlider({
  label,
  steps,
  low,
  high,
  onChange,
  format,
}: {
  label: string
  steps: readonly string[]
  low: number
  high: number
  onChange: (low: number, high: number) => void
  format?: (low: number, high: number) => string
}) {
  const last = steps.length - 1
  const pct = (i: number) => (last === 0 ? 0 : (i / last) * 100)
  const open = low === 0 && high === last
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-bold">{label}</span>
        <span className="text-sm font-bold text-accent">{open ? 'Qualquer' : format ? format(low, high) : `${steps[low]} – ${steps[high]}`}</span>
      </div>
      <div className="dual-range relative mt-1 h-7">
        <div className="absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${pct(low) / 100})`, right: `calc(0.75rem + (100% - 1.5rem) * ${1 - pct(high) / 100})` }} />
        <input type="range" style={{ zIndex: low > last / 2 ? 3 : 1 }} aria-label={`${label}: mínimo`} min={0} max={last} step={1} value={low} onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)} />
        <input type="range" aria-label={`${label}: máximo`} min={0} max={last} step={1} value={high} onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))} />
      </div>
    </div>
  )
}
