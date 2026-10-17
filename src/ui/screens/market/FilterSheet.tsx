import { useState } from 'react'
import { defaultFilters, searchPlayers } from '../../../engine/market'
import type { MarketFilters, Range, Situation } from '../../../engine/market'
import { NATIONALITIES, POSITIONS } from '../../../engine/types'
import type { Nationality, Position } from '../../../engine/types'
import type { Game } from '../../../store/game'
import { NATIONALITY_LABELS, POSITION_LABELS, SITUATION_LABELS } from '../../labels'
import { RangeSlider, Sheet } from '../../theme'

interface Scale {
  /** Valores dos passos; o primeiro e o último são "sem limite". */
  values: readonly number[]
  label: (v: number) => string
}

const money = (v: number) => (v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(v / 1_000)} mil`)

const SCALES = {
  overall: { values: [-Infinity, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, Infinity], label: String },
  age: { values: [-Infinity, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, Infinity], label: String },
  value: { values: [-Infinity, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, Infinity], label: money },
  salary: { values: [-Infinity, 10_000, 20_000, 40_000, 80_000, 150_000, 300_000, 600_000, 1_200_000, Infinity], label: money },
} satisfies Record<string, Scale>

type RangeKey = keyof typeof SCALES

const indexOf = (scale: Scale, range: Range): [number, number] => {
  const last = scale.values.length - 1
  const low = range.min === -Infinity ? 0 : Math.max(0, scale.values.indexOf(range.min))
  const high = range.max === Infinity ? last : Math.max(0, scale.values.indexOf(range.max))
  return [low, high]
}

const toRange = (scale: Scale, low: number, high: number): Range => ({ min: low === 0 ? -Infinity : (scale.values[low] as number), max: high === scale.values.length - 1 ? Infinity : (scale.values[high] as number) })

const RANGE_LABELS: Record<RangeKey, string> = { overall: 'Força', age: 'Idade', value: 'Valor de mercado', salary: 'Salário por mês' }

const select = 'mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-semibold text-slate-100'
const caption = 'text-[11px] font-bold uppercase tracking-[0.14em] text-muted'

/** Janela de filtros: situação, posição, nacionalidade e faixas de força, idade, valor e salário. */
export function FilterSheet({
  game,
  filters,
  situations,
  onApply,
  onClose,
  base,
  restrict,
}: {
  game: Game
  filters: MarketFilters
  situations: readonly Situation[]
  onApply: (f: MarketFilters) => void
  onClose: () => void
  /** Filtros que a aba já fixa (Livres, por exemplo): o "Limpar" volta para eles. */
  base?: Partial<MarketFilters>
  restrict?: (p: import('../../../engine/types').Player) => boolean
}) {
  const [draft, setDraft] = useState(filters)
  const count = searchPlayers(game.season, game.userTeamId, draft, restrict).length
  const set = <K extends keyof MarketFilters>(key: K, value: MarketFilters[K]) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <Sheet
      title="Filtros"
      placement="center"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft({ ...defaultFilters(), ...base, query: draft.query, sort: draft.sort })} className="min-h-12 rounded-xl border border-line bg-surface-2 px-5 font-bold">
            Limpar
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
            className="cut-corner-sm min-h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink active:scale-95"
          >
            Ver {count} {count === 1 ? 'jogador' : 'jogadores'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {situations.length > 1 && (
          <label className="block">
            <span className={caption}>Situação</span>
            <select className={select} value={draft.situation} onChange={(e) => set('situation', e.target.value as Situation)}>
              {situations.map((s) => (
                <option key={s} value={s}>
                  {SITUATION_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={caption}>Posição</span>
            <select className={select} value={draft.position} onChange={(e) => set('position', e.target.value as Position | 'all')}>
              <option value="all">Todas</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={caption}>Nacionalidade</span>
            <select className={select} value={draft.nationality} onChange={(e) => set('nationality', e.target.value as Nationality | 'all')}>
              <option value="all">Todas</option>
              {[...NATIONALITIES].sort((x, y) => NATIONALITY_LABELS[x].localeCompare(NATIONALITY_LABELS[y], 'pt')).map((n) => (
                <option key={n} value={n}>
                  {NATIONALITY_LABELS[n]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(Object.keys(SCALES) as RangeKey[]).map((key) => {
          const scale: Scale = SCALES[key]
          const [low, high] = indexOf(scale, draft[key])
          return (
            <RangeSlider
              key={key}
              label={RANGE_LABELS[key]}
              steps={scale.values.map((v) => (Number.isFinite(v) ? scale.label(v) : '–'))}
              low={low}
              high={high}
              onChange={(l, h) => set(key, toRange(scale, l, h))}
              format={(l, h) => `${l === 0 ? 'até' : scale.label(scale.values[l] as number)}${l === 0 ? '' : h === scale.values.length - 1 ? ' ou mais' : ' a'} ${h === scale.values.length - 1 ? '' : scale.label(scale.values[h] as number)}`.trim()}
            />
          )
        })}
      </div>
    </Sheet>
  )
}
