import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { Player } from '../../../engine/types'
import { squadOf, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { PlayerDetail } from '../../components/PlayerDetail'
import { playerName } from '../../format'
import { NUMBERS_LABELS, POSITION_SHORT_LABELS } from '../../labels'
import { NUMBERS_NATURAL_DIRECTION, averageRating, isOnYellowEdge, sortNumbers } from '../../squadSort'
import type { NumbersKey } from '../../squadSort'
import { Panel, ValueBadge } from '../../theme'

const COLUMNS: { key: NumbersKey; head: ReactNode; width: string }[] = [
  { key: 'games', head: 'J', width: 'w-7' },
  { key: 'goals', head: 'G', width: 'w-7' },
  { key: 'assists', head: 'A', width: 'w-7' },
  { key: 'yellow', head: <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-amber-300" />, width: 'w-7' },
  { key: 'red', head: <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-loss" />, width: 'w-7' },
  { key: 'rating', head: 'Nota', width: 'w-11' },
]

function Cell({ value, dim = false }: { value: number; dim?: boolean }) {
  return <span className={`w-7 text-center text-base tabular-nums ${value === 0 || dim ? 'italic text-muted' : 'font-bold'}`}>{value}</span>
}

function NumbersRow({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const s = player.seasonStats
  const rating = averageRating(player)
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-1 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{playerName(player)}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {POSITION_SHORT_LABELS[player.position]}
            {player.condition.suspensionGames > 0 ? (
              <span className="font-bold text-loss">suspenso</span>
            ) : (
              isOnYellowEdge(player) && <span className="font-bold text-amber-300">pendurado</span>
            )}
          </span>
        </span>
        <Cell value={s.appearances} />
        <Cell value={s.goals} />
        <Cell value={s.assists} />
        <Cell value={s.yellowCards} />
        <Cell value={s.redCards} />
        <span className="flex w-11 justify-end">
          {rating !== undefined ? (
            <ValueBadge value={rating} scale="rating" className="!min-w-10 !text-base">
              {rating.toFixed(1)}
            </ValueBadge>
          ) : (
            <span className="italic text-muted">–</span>
          )}
        </span>
      </button>
    </li>
  )
}

/** Aba Números: a temporada de cada jogador, ordenável por qualquer coluna. */
export function Numbers({ game }: { game: Game }) {
  const team = userTeam(game)
  const squad = squadOf(game, team.id)
  const [sort, setSort] = useState<{ key: NumbersKey; direction: 1 | -1 }>({ key: 'goals', direction: -1 })
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useMemo(() => sortNumbers(squad, sort.key, sort.direction), [squad, sort])
  const open = squad.find((p) => p.id === openId)
  const pick = (key: NumbersKey) => setSort((s) => (s.key === key ? { key, direction: (s.direction * -1) as 1 | -1 } : { key, direction: NUMBERS_NATURAL_DIRECTION[key] }))
  const arrow = (key: NumbersKey) => (sort.key === key ? (sort.direction === 1 ? '▲' : '▼') : '')

  return (
    <div className="space-y-3">
      <Panel className="overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">
          <button type="button" className={`min-h-10 flex-1 text-left ${sort.key === 'name' ? 'text-white' : ''}`} onClick={() => pick('name')} aria-label="Ordenar por jogador">
            Jogador {arrow('name')}
          </button>
          {COLUMNS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => pick(c.key)}
              aria-label={`Ordenar por ${NUMBERS_LABELS[c.key]}`}
              className={`flex min-h-10 flex-col items-center justify-center ${c.width} ${sort.key === c.key ? 'text-white' : ''}`}
            >
              {c.head}
              <span className="text-[9px] leading-3">{arrow(c.key) || ' '}</span>
            </button>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <NumbersRow key={p.id} player={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </ul>
      </Panel>
      <p className="text-[11px] text-muted">
        J jogos · G gols · A assistências · cartões amarelos e vermelhos da temporada · nota média das partidas com 20 minutos ou mais. Pendurado: mais um amarelo e fica de fora do jogo seguinte.
      </p>
      {open && <PlayerDetail player={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

