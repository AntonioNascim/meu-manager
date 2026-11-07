import { teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import type { OnlineMatchHandle } from '../../../store/onlineMatch'
import { Crest } from '../../theme'
import { shortName } from '../standings/parts'

/** Aba "Jogos" na liga online: os outros jogos da rodada que o servidor está jogando agora (placar e minuto de cada um). */
export function OnlineOthers({ game, handle }: { game: Game; handle: OnlineMatchHandle }) {
  const mine = handle.game?.matchId
  const others = handle.state.games.filter((g) => g.matchId !== mine)
  if (others.length === 0) return <p className="rounded-xl bg-surface p-3 text-sm text-muted">Não há outros jogos de técnicos nesta rodada.</p>
  return (
    <ul className="space-y-2" aria-label="Outros jogos da rodada">
      {others.map((g) => {
        const home = teamById(game, g.snapshot.home.teamId)
        const away = teamById(game, g.snapshot.away.teamId)
        const label = g.snapshot.finished ? 'Fim' : `${g.snapshot.minute}'`
        return (
          <li key={g.matchId} className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm" data-testid="online-other">
            <Crest team={home} size="sm" />
            <span className="min-w-0 flex-1 truncate font-semibold">{shortName(home)}</span>
            <span className="text-xl font-bold tabular-nums">
              {g.snapshot.homeGoals} x {g.snapshot.awayGoals}
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-semibold">{shortName(away)}</span>
            <Crest team={away} size="sm" />
            <span className="w-10 text-right text-xs font-bold text-emerald-400">{label}</span>
          </li>
        )
      })}
    </ul>
  )
}
