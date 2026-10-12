import { useState } from 'react'
import { squadOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { isUnavailable, sortSquad } from '../squadSort'
import type { SquadSortKey } from '../squadSort'
import { TopTabs } from '../theme'
import { Lineup } from './squad/Lineup'
import { Numbers } from './squad/Numbers'
import { Players } from './squad/Players'

export { sortSquad }
export type { SquadSortKey }

type Tab = 'players' | 'lineup' | 'numbers'

/** Tela de Elenco: abas Jogadores, Escalação e Números (Base e Treino virão depois). */
export function Squad({ game, initialTab = 'players' }: { game: Game; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const team = userTeam(game)
  const xiById = new Map(squadOf(game, team.id).map((p) => [p.id, p]))
  // Pendência na Escalação: algum titular lesionado ou suspenso.
  const lineupAlert = team.tactic.startingXI.some((id) => {
    const p = xiById.get(id)
    return p !== undefined && isUnavailable(p)
  })

  return (
    <div className="space-y-3">
      <TopTabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'players', label: 'Jogadores' },
          { id: 'lineup', label: 'Escalação', alert: lineupAlert },
          { id: 'numbers', label: 'Números' },
        ]}
      />
      {tab === 'players' && <Players game={game} />}
      {tab === 'lineup' && <Lineup game={game} />}
      {tab === 'numbers' && <Numbers game={game} />}
    </div>
  )
}
