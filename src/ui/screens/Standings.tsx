import { useState } from 'react'
import type { Competition } from '../../engine/types'
import type { Game } from '../../store/game'
import { TopTabs } from '../theme'
import { History } from './standings/History'
import { Leaders } from './standings/Leaders'
import type { LeaderBoard } from './standings/Leaders'
import { Rounds } from './standings/Rounds'
import { Table } from './standings/Table'
import { TeamPage } from './standings/TeamPage'

export { latestPlayedRound, zoneOf } from './standings/Table'

type Section = 'table' | 'rounds' | LeaderBoard | 'history'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'table', label: 'Classificação' },
  { id: 'rounds', label: 'Rodadas' },
  { id: 'goals', label: 'Artilharia' },
  { id: 'assists', label: 'Assistências' },
  { id: 'cards', label: 'Cartões' },
  { id: 'history', label: 'Histórico' },
]

/** Tabela: classificação (com temporadas passadas), rodadas, artilharia, assistências, cartões e histórico; tocar num time abre a página dele. */
export function Standings({ game, initialSection = 'table' }: { game: Game; initialSection?: Section }) {
  const competitions = game.season.season.competitions
  const mine = competitions.find((c) => c.teamIds.includes(game.userTeamId)) as Competition
  const [competitionId, setCompetitionId] = useState(mine.id)
  const [section, setSection] = useState<Section>(initialSection)
  const [teamId, setTeamId] = useState<string | null>(() => (import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('equipe') : null))
  const competition = competitions.find((c) => c.id === competitionId) as Competition

  if (teamId) return <TeamPage game={game} teamId={teamId} onBack={() => setTeamId(null)} onTeam={setTeamId} />

  return (
    <div className="space-y-3">
      <TopTabs scroll value={section} onChange={setSection} options={SECTIONS} />
      {section !== 'history' && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[...competitions]
            .sort((a, b) => Number(b.pyramid === mine.pyramid) - Number(a.pyramid === mine.pyramid) || a.tier - b.tier)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.id === competitionId}
                onClick={() => setCompetitionId(c.id)}
                className={`min-h-11 ${competitions.length > 3 ? 'shrink-0 px-4' : 'flex-1'} rounded-full border text-sm font-bold ${c.id === competitionId ? 'border-amber-300 bg-gradient-to-b from-amber-200 to-amber-400 text-bg' : 'border-line bg-surface text-slate-200'}`}
              >
                {c.name}
              </button>
            ))}
        </div>
      )}
      {section === 'table' && <Table game={game} competition={competition} onTeam={setTeamId} />}
      {section === 'rounds' && <Rounds game={game} competition={competition} onTeam={setTeamId} />}
      {(section === 'goals' || section === 'assists' || section === 'cards') && <Leaders key={`${section}-${competition.id}`} game={game} competition={competition} board={section} onTeam={setTeamId} />}
      {section === 'history' && <History game={game} onTeam={setTeamId} />}
    </div>
  )
}
