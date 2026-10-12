import { useMemo, useState } from 'react'
import { playerOverall } from '../../engine/overall'
import { POSITIONS } from '../../engine/types'
import type { Player } from '../../engine/types'
import { squadOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { bandFor, conditionBand, formBand } from '../colors'
import { PlayerDetail, StatusTags } from '../components/PlayerDetail'
import { playerName } from '../format'
import { POSITION_SHORT_LABELS } from '../labels'

export type SquadSortKey = 'position' | 'name' | 'age' | 'overall' | 'fitness' | 'form'

const COLUMNS: { key: SquadSortKey; label: string; width: string }[] = [
  { key: 'position', label: 'Pos', width: 'w-11' },
  { key: 'name', label: 'Nome', width: 'flex-1' },
  { key: 'age', label: 'Id', width: 'w-8' },
  { key: 'overall', label: 'For', width: 'w-9' },
  { key: 'fitness', label: 'Cond', width: 'w-11' },
  { key: 'form', label: 'Forma', width: 'w-11' },
]

/** Ordem natural de cada coluna (a primeira tecla toca nessa direção; tocar de novo inverte). */
const NATURAL_DIRECTION: Record<SquadSortKey, 1 | -1> = { position: 1, name: 1, age: 1, overall: -1, fitness: -1, form: -1 }

export function sortSquad(players: readonly Player[], key: SquadSortKey, direction: 1 | -1): Player[] {
  const value = (p: Player): number | string => {
    switch (key) {
      case 'position': return POSITIONS.indexOf(p.position)
      case 'name': return playerName(p)
      case 'age': return p.age
      case 'overall': return playerOverall(p)
      case 'fitness': return p.condition.fitness
      case 'form': return p.condition.form
    }
  }
  return [...players].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const order = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : (va as number) - (vb as number)
    // Desempate: posição e depois força, para a lista ficar estável e útil.
    return direction * order || POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || playerOverall(b) - playerOverall(a)
  })
}

/** Tela de elenco: lista ordenável e detalhe do jogador. */
export function Squad({ game }: { game: Game }) {
  const team = userTeam(game)
  const squad = squadOf(game, team.id)
  const [sort, setSort] = useState<{ key: SquadSortKey; direction: 1 | -1 }>({ key: 'position', direction: 1 })
  const [openId, setOpenId] = useState<string | null>(null)
  const sorted = useMemo(() => sortSquad(squad, sort.key, sort.direction), [squad, sort])
  const starters = new Set(team.tactic.startingXI)
  const open = squad.find((p) => p.id === openId)
  const unavailable = squad.filter((p) => p.condition.injuryDaysLeft > 0 || p.condition.suspensionGames > 0).length

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Elenco</h1>
        <span className="text-xs text-slate-400">
          {squad.length} jogadores{unavailable > 0 ? ` · ${unavailable} indisponíve${unavailable > 1 ? 'is' : 'l'}` : ''}
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-t-xl bg-slate-800 px-2 py-1 text-[11px] font-semibold uppercase text-slate-400">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, direction: (s.direction * -1) as 1 | -1 } : { key: c.key, direction: NATURAL_DIRECTION[c.key] }))}
            className={`${c.width} min-h-10 text-left ${sort.key === c.key ? 'text-emerald-400' : ''}`}
            aria-label={`Ordenar por ${c.label}`}
          >
            {c.label}
            {sort.key === c.key ? (sort.direction === 1 ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-slate-800 rounded-b-xl bg-slate-800/50">
        {sorted.map((p) => {
          const overall = playerOverall(p)
          const hasForm = p.condition.recentRatings.length > 0
          const out = p.condition.injuryDaysLeft > 0 || p.condition.suspensionGames > 0
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className={`flex min-h-14 w-full items-center gap-1 px-2 py-1.5 text-left ${out ? 'opacity-70' : ''}`}>
                <span className="w-11 text-xs font-semibold text-slate-300">{POSITION_SHORT_LABELS[p.position]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    {starters.has(p.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" title="Titular" />}
                    <span className="truncate text-sm font-semibold">{playerName(p)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    <StatusTags player={p} />
                  </span>
                </span>
                <span className="w-8 text-sm tabular-nums text-slate-300">{p.age}</span>
                <span className={`w-9 text-sm font-bold tabular-nums ${bandFor(overall).text}`}>{Math.round(overall)}</span>
                <span className="w-11">
                  <span className={`text-sm tabular-nums ${conditionBand(p.condition.fitness).text}`}>{Math.round(p.condition.fitness)}</span>
                </span>
                <span className={`w-11 text-sm tabular-nums ${hasForm ? formBand(p.condition.form).text : 'text-slate-500'}`}>
                  {hasForm ? p.condition.form.toFixed(1) : '–'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">● titular · For = força geral · Cond = condição física · Forma = média das últimas notas</p>

      {open && <PlayerDetail player={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
