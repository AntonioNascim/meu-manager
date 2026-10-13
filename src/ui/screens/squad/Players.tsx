import { useMemo, useState } from 'react'
import { playerOverall } from '../../../engine/overall'
import type { Player } from '../../../engine/types'
import { squadOf, strengthChange, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { StatusTags } from '../../components/PlayerDetail'
import { PlayerDetail } from '../../components/PlayerDetail'
import { formatCompactMoney, playerName } from '../../format'
import { POSITION_GROUP_LABELS, POSITION_SHORT_LABELS, SQUAD_SORT_LABELS } from '../../labels'
import { NATURAL_DIRECTION, inGroup, isUnavailable, sortSquad } from '../../squadSort'
import type { PositionGroup, SquadSortKey } from '../../squadSort'
import { SellSheet } from '../market/SellSheet'
import { ConditionBar, Flag, MoodIcon, Panel, Trend, ValueBadge } from '../../theme'

const GROUPS = Object.keys(POSITION_GROUP_LABELS) as PositionGroup[]
const SORT_KEYS: SquadSortKey[] = ['position', 'overall', 'age', 'fitness', 'morale']

function PlayerRow({ player, starter, change, onOpen }: { player: Player; starter: boolean; change: number; onOpen: () => void }) {
  const out = isUnavailable(player)
  return (
    <li>
      <button type="button" onClick={onOpen} className={`flex min-h-16 w-full items-center gap-2 px-3 py-2 text-left ${out ? 'opacity-75' : ''}`}>
        <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[player.position]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="truncate font-bold">{playerName(player)}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
            <span>
              {player.age}a · {formatCompactMoney(player.contract.salary)}/mês · até {player.contract.endDate.slice(0, 4)}
            </span>
            {starter && <span className="font-bold text-sky-300">titular</span>}
            <StatusTags player={player} />
          </span>
        </span>
        <MoodIcon morale={player.condition.morale} />
        <ConditionBar fitness={player.condition.fitness} />
        <span className="flex w-12 shrink-0 flex-col items-center gap-0.5">
          <ValueBadge value={playerOverall(player)}>{Math.round(playerOverall(player))}</ValueBadge>
          <Trend change={change} />
        </span>
      </button>
    </li>
  )
}

/** Aba Jogadores: filtro por setor, ordenação, resumo de disponíveis e a lista do elenco. */
export function Players({ game }: { game: Game }) {
  const team = userTeam(game)
  const squad = squadOf(game, team.id)
  const [group, setGroup] = useState<PositionGroup>('all')
  const [sort, setSort] = useState<{ key: SquadSortKey; direction: 1 | -1 }>({ key: 'position', direction: 1 })
  const [openId, setOpenId] = useState<string | null>(() => (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('detalhe') ? (squad[0]?.id ?? null) : null))
  const list = useMemo(() => sortSquad(squad.filter((p) => inGroup(p, group)), sort.key, sort.direction), [squad, group, sort])
  const starters = new Set(team.tactic.startingXI)
  const available = squad.filter((p) => !isUnavailable(p)).length
  const open = squad.find((p) => p.id === openId)
  const [selling, setSelling] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              aria-pressed={group === g}
              className={`min-h-10 rounded-full border px-3.5 text-sm font-bold ${group === g ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}
            >
              {POSITION_GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          aria-label="Ordenar por"
          value={sort.key}
          onChange={(e) => {
            const key = e.target.value as SquadSortKey
            setSort({ key, direction: NATURAL_DIRECTION[key] })
          }}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-semibold text-slate-100"
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              Ordenar: {SQUAD_SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSort((s) => ({ ...s, direction: (s.direction * -1) as 1 | -1 }))}
          aria-label="Inverter a ordem"
          className="min-h-11 min-w-11 rounded-xl border border-line bg-surface font-bold"
        >
          {sort.direction === 1 ? '▲' : '▼'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted">
        <span>
          {available}/{squad.length} disponíveis
        </span>
        <span className="inline-flex items-center gap-1">
          <MoodIcon morale={80} size={16} /> moral
        </span>
        <span className="inline-flex items-center gap-1">
          <ConditionBar fitness={80} className="!h-4" /> condição
        </span>
        <span className="inline-flex items-center gap-1">
          <Trend change={1} /> <Trend change={-1} /> força no mês
        </span>
      </div>

      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <PlayerRow key={p.id} player={p} starter={starters.has(p.id)} change={strengthChange(game, p)} onOpen={() => setOpenId(p.id)} />
          ))}
          {list.length === 0 && <li className="p-4 text-sm text-muted">Nenhum jogador neste setor.</li>}
        </ul>
      </Panel>

      {open && (
        <PlayerDetail
          player={open}
          onClose={() => {
            setOpenId(null)
            setSelling(false)
          }}
          history={game.season.training.history[open.id]}
          currentDate={game.season.season.currentDate}
          footer={
            open.contract.loanedFrom ? undefined : (
              <button type="button" onClick={() => setSelling(true)} className="min-h-12 w-full rounded-xl border border-line bg-surface-2 font-bold active:scale-95">
                Vender, emprestar ou liberar
              </button>
            )
          }
        />
      )}
      {open && selling && (
        <SellSheet
          game={game}
          player={open}
          onClose={() => setSelling(false)}
          onDone={() => {
            setSelling(false)
            setOpenId(null)
          }}
        />
      )}
    </div>
  )
}
