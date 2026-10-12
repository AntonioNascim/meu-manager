import { userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { setGame } from '../../store/gameStore'
import { clearLive } from '../../store/liveMatch'
import { Button, Card, TeamBadge } from '../components/ui'
import { formatDate } from '../format'
import { DISMISSAL_REASON_LABELS } from '../labels'

/** Fim de jogo: a diretoria demitiu o técnico. */
export function Dismissed({ game }: { game: Game }) {
  const team = userTeam(game)
  const dismissal = game.dismissal
  if (!dismissal) return null
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 bg-slate-900 px-4 text-slate-100">
      <div className="flex flex-col items-center gap-2 text-center">
        <TeamBadge team={team} size="lg" />
        <h1 className="text-2xl font-bold text-rose-300">Você foi demitido</h1>
        <p className="text-sm text-slate-400">{team.name} · {formatDate(dismissal.date)}</p>
      </div>
      <Card>
        <p className="text-slate-200">{DISMISSAL_REASON_LABELS[dismissal.reason]}</p>
        <p className="mt-2 text-sm text-slate-400">
          O time estava em {dismissal.position}º lugar, com a confiança da diretoria em {Math.round(dismissal.confidence)}/100. A meta era o {team.objective.targetPosition}º lugar.
        </p>
      </Card>
      <Button
        onClick={() => {
          clearLive()
          setGame(null)
        }}
      >
        Começar um novo jogo
      </Button>
    </div>
  )
}
