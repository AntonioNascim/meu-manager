import { useState } from 'react'
import { academyAlert, squadOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { isUnavailable, sortSquad } from '../squadSort'
import type { SquadSortKey } from '../squadSort'
import { TopTabs } from '../theme'
import { Academy } from './squad/Academy'
import { Lineup } from './squad/Lineup'
import { Numbers } from './squad/Numbers'
import { Players } from './squad/Players'
import { Training } from './squad/Training'

export { sortSquad }
export type { SquadSortKey }

export type SquadTab = 'players' | 'lineup' | 'numbers' | 'academy' | 'training'

/** Tela de Elenco: abas Jogadores, Escalação, Números, Base e Treino. */
export function Squad({ game, initialTab = 'players' }: { game: Game; initialTab?: SquadTab }) {
  const [tab, setTab] = useState<SquadTab>(initialTab)
  const team = userTeam(game)
  const xiById = new Map(squadOf(game, team.id).map((p) => [p.id, p]))
  // Pendência na Escalação: algum titular lesionado ou suspenso.
  const lineupAlert = team.tactic.startingXI.some((id) => {
    const p = xiById.get(id)
    return p !== undefined && isUnavailable(p)
  })

  const academy = academyAlert(game)

  return (
    <div className="space-y-3">
      <TopTabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'players', label: 'Jogadores' },
          { id: 'lineup', label: 'Escalação', alert: lineupAlert },
          { id: 'numbers', label: 'Números' },
          { id: 'academy', label: 'Base', alert: academy.pending > 0 || academy.arrivals > 0 },
          { id: 'training', label: 'Treino' },
        ]}
      />
      {tab === 'players' && <Players game={game} />}
      {tab === 'lineup' && <Lineup game={game} />}
      {tab === 'numbers' && <Numbers game={game} />}
      {tab === 'academy' && <Academy game={game} />}
      {tab === 'training' && <Training game={game} />}
    </div>
  )
}
