import { useState } from 'react'
import { takeUserJob, teamById, userJobOpenings } from '../../../store/game'
import type { Game } from '../../../store/game'
import { setGame } from '../../../store/gameStore'
import { clearLive } from '../../../store/liveMatch'
import { Button, TeamBadge } from '../../components/ui'

/** Propostas de outros clubes (técnico empregado) ou vagas abertas (técnico demitido), com o botão de assumir. */
export function JobList({ game, onTaken, empty }: { game: Game; onTaken?: () => void; empty: string }) {
  const [asking, setAsking] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const openings = userJobOpenings(game)
  const take = (teamId: string) => {
    try {
      clearLive()
      setGame(takeUserJob(game, teamId))
      onTaken?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível trocar de clube')
    }
  }
  if (openings.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="space-y-2">
      {openings.map((o) => {
        const team = teamById(game, o.teamId)
        const league = game.season.season.competitions.find((c) => c.id === o.competitionId)
        return (
          <li key={o.teamId} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <TeamBadge team={team} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{team.name}</div>
              <div className="truncate text-xs text-muted">
                {league?.name} · {o.position}º lugar, meta: {o.targetPosition}º · reputação {team.reputation}
              </div>
            </div>
            {asking === o.teamId ? (
              <Button onClick={() => take(o.teamId)}>Confirmar</Button>
            ) : (
              <Button variant="secondary" onClick={() => setAsking(o.teamId)}>
                Assumir
              </Button>
            )}
          </li>
        )
      })}
      {error && <li className="text-sm text-loss">{error}</li>}
    </ul>
  )
}
