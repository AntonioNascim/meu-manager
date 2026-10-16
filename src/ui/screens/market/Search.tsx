import { useMemo, useState } from 'react'
import { defaultFilters, interestContext, interestIn, searchContext, searchPlayers } from '../../../engine/market'
import type { MarketFilters, MarketSort, PositionGroup, QuickFilter, Situation } from '../../../engine/market'
import type { OfferKind, Player } from '../../../engine/types'
import type { Game } from '../../../store/game'
import { MARKET_SORT_LABELS, POSITION_GROUP_LABELS, QUICK_FILTER_LABELS } from '../../labels'
import { Icon, Panel } from '../../theme'
import { FilterSheet } from './FilterSheet'
import { Negotiation } from './Negotiation'
import { FavoriteStar, MarketRow } from './parts'
import type { ReactNode } from 'react'

const PAGE = 40
const GROUPS = Object.keys(POSITION_GROUP_LABELS) as PositionGroup[]
const QUICK: QuickFilter[] = ['budget', 'bargain', 'prospect', 'expiring']
const SORTS = Object.keys(MARKET_SORT_LABELS) as MarketSort[]

const chip = (on: boolean) => `min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-bold ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`
const quickChip = (on: boolean) => `min-h-10 shrink-0 rounded-full border border-dashed px-3.5 text-sm font-bold ${on ? 'border-accent bg-accent/15 text-accent' : 'border-slate-500 bg-surface text-slate-200'}`

/**
 * Busca de jogadores: campo de busca, filtros em janela, atalhos rápidos, chips de série e posição, contagem e ordenação.
 * `preset` fixa filtros da aba (Livres, por exemplo); `restrict` limita o universo (Favoritos, Listas).
 */
export function Search({
  game,
  open,
  preset,
  situations = ['all', 'club', 'free', 'expiring'],
  showTier = true,
  restrict,
  initialKind,
  onPick,
  trailing,
  note,
  empty = 'Nenhum jogador encontrado.',
  header,
}: {
  game: Game
  open: boolean
  preset?: Partial<MarketFilters>
  situations?: readonly Situation[]
  showTier?: boolean
  restrict?: (p: Player) => boolean
  /** Tipo de negócio que a negociação abre (as listas de empréstimo abrem em empréstimo). */
  initialKind?: OfferKind
  /** Troca a negociação por outra ação ao tocar no jogador (pré-contrato). */
  onPick?: (p: Player) => void
  trailing?: (p: Player) => ReactNode
  note?: (p: Player) => ReactNode
  empty?: string
  header?: ReactNode
}) {
  const [filters, setFilters] = useState<MarketFilters>(() => ({ ...defaultFilters(), ...preset }))
  const dev = (key: string) => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(key) !== null
  const [sheet, setSheet] = useState(() => dev('filtros'))
  const [limit, setLimit] = useState(PAGE)
  const [pickedId, setPickedId] = useState<string | null>(() => (dev('negociar') ? (searchPlayers(game.season, game.userTeamId, { ...defaultFilters(), ...preset }, restrict)[2]?.id ?? null) : null))
  const state = game.season
  const list = useMemo(() => searchPlayers(state, game.userTeamId, filters, restrict), [state, game.userTeamId, filters, restrict])
  const shown = list.slice(0, limit)
  const ctx = useMemo(() => interestContext(state, game.userTeamId), [state, game.userTeamId])
  const sc = searchContext(state, game.userTeamId)
  const picked = state.players.find((p) => p.id === pickedId)
  const update = (change: Partial<MarketFilters>) => {
    setFilters((f) => ({ ...f, ...change }))
    setLimit(PAGE)
  }
  const activeFilters = (['overall', 'age', 'value', 'salary'] as const).filter((k) => filters[k].min > -Infinity || filters[k].max < Infinity).length + (filters.position !== 'all' ? 1 : 0) + (filters.nationality !== 'all' ? 1 : 0) + (filters.situation !== (preset?.situation ?? 'all') ? 1 : 0)

  return (
    <div className="space-y-3">
      {header}
      <div className="flex gap-2">
        <input
          type="search"
          aria-label="Buscar jogador ou clube"
          placeholder="Buscar jogador ou clube"
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-slate-100 placeholder:text-muted"
        />
        <button type="button" onClick={() => setSheet(true)} className="flex min-h-12 shrink-0 items-center gap-2 rounded-2xl border border-line bg-surface px-4 font-bold">
          <Icon name="filter" size={18} />
          Filtros
          {activeFilters > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-accent-ink">{activeFilters}</span>}
        </button>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUICK.map((q) => {
          const on = filters.quick.includes(q)
          return (
            <button key={q} type="button" aria-pressed={on} onClick={() => update({ quick: on ? filters.quick.filter((x) => x !== q) : [...filters.quick, q] })} className={quickChip(on)}>
              {QUICK_FILTER_LABELS[q]}
            </button>
          )
        })}
      </div>

      {showTier && (
        <div className="flex gap-2">
          {([['all', 'Todas'], [1, 'Série A'], [2, 'Série B'], [3, 'Série C']] as const).map(([id, label]) => (
            <button key={String(id)} type="button" aria-pressed={filters.tier === id} onClick={() => update({ tier: id })} className={chip(filters.tier === id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button key={g} type="button" aria-pressed={filters.group === g} onClick={() => update({ group: g })} className={chip(filters.group === g)}>
            {POSITION_GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted" aria-live="polite">
          {list.length} {list.length === 1 ? 'jogador' : 'jogadores'}
        </span>
        <select aria-label="Ordenar por" value={filters.sort} onChange={(e) => update({ sort: e.target.value as MarketSort })} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-semibold text-slate-100">
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {MARKET_SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <MarketRow key={p.id} game={game} player={p} interest={interestIn(ctx, p)} onOpen={() => (onPick ? onPick(p) : setPickedId(p.id))} favorite={<FavoriteStar game={game} playerId={p.id} />} trailing={trailing?.(p)} note={note?.(p)} />
          ))}
          {list.length === 0 && <li className="p-4 text-sm text-muted">{empty}</li>}
        </ul>
      </Panel>
      {list.length > shown.length && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="min-h-12 w-full rounded-xl border border-line bg-surface font-bold">
          Mostrar mais ({list.length - shown.length})
        </button>
      )}
      <p className="text-center text-[11px] text-muted">Atalho "Cabem no bolso": valor até {sc.budget > 0 ? 'o orçamento de compras' : 'o orçamento (hoje zerado)'}.</p>

      {sheet && <FilterSheet game={game} filters={filters} situations={situations} base={preset} restrict={restrict} onApply={(f) => update(f)} onClose={() => setSheet(false)} />}
      {picked && <Negotiation key={picked.id} game={game} player={picked} open={open} {...(initialKind ? { initialKind } : {})} onClose={() => setPickedId(null)} />}
    </div>
  )
}
