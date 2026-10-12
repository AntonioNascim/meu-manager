import type { Match } from '../../engine/types'
import {
  advanceGame,
  lastUserMatch,
  nextEventOf,
  nextUserMatch,
  standingsOf,
  teamById,
  teamStrength,
  userCompetition,
  userTeam,
} from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { Button, Card, TeamBadge } from '../components/ui'
import { formatDate, outcomeFor } from '../format'
import type { ScreenId } from '../navigation'
import { OUTCOME_LABELS, OUTCOME_SHORT_LABELS, SEASON_PHASE_LABELS } from '../labels'

const OUTCOME_COLOR = { W: 'bg-emerald-500 text-slate-950', D: 'bg-slate-500 text-white', L: 'bg-rose-500 text-white' } as const

function MatchLine({ game, match }: { game: Game; match: Match }) {
  const home = teamById(game, match.homeTeamId)
  const away = teamById(game, match.awayTeamId)
  const result = match.result
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
        <TeamBadge team={home} size="lg" />
        <span className="w-full truncate text-sm font-semibold">{home.name}</span>
      </div>
      <div className="text-center">
        {result ? (
          <span className="text-3xl font-bold tabular-nums">
            {result.homeGoals} x {result.awayGoals}
          </span>
        ) : (
          <span className="text-xl font-bold text-slate-400">x</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
        <TeamBadge team={away} size="lg" />
        <span className="w-full truncate text-sm font-semibold">{away.name}</span>
      </div>
    </div>
  )
}

/** Painel principal: próximo jogo, posição na tabela e o botão de avançar. */
export function Dashboard({ game, onNavigate }: { game: Game; onNavigate: (screen: ScreenId) => void }) {
  const team = userTeam(game)
  const competition = userCompetition(game)
  const table = standingsOf(game, competition)
  const position = table.findIndex((r) => r.teamId === team.id) + 1
  const row = table[position - 1]
  const next = nextUserMatch(game)
  const last = lastUserMatch(game)
  const seasonOver = nextEventOf(game).type === 'season-end'
  const opponent = next ? teamById(game, next.homeTeamId === team.id ? next.awayTeamId : next.homeTeamId) : undefined
  const lastOutcome = last ? outcomeFor(last, team.id) : undefined

  const pending = game.pendingUserMatch

  // Avança até o próximo dia de jogos; se o time do jogador joga nele, vai para a tela da partida.
  const advance = () => {
    if (pending) return onNavigate('match')
    const moved = advanceGame(game)
    updateGame(() => moved)
    if (moved.pendingUserMatch) onNavigate('match')
  }

  return (
    <div className="space-y-3">
      <Card title={`Próximo jogo${next ? ` · ${competition.name}, rodada ${next.round}` : ''}`}>
        {next && opponent ? (
          <>
            <MatchLine game={game} match={next} />
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>{formatDate(next.date)}</span>
              <span>{next.homeTeamId === team.id ? `Em casa · ${team.stadium.name}` : `Fora · ${opponent.stadium.name}`}</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Força dos titulares: {teamStrength(game, team).toFixed(0)} (você) x {teamStrength(game, opponent).toFixed(0)} ({opponent.abbreviation})
            </div>
          </>
        ) : (
          <p className="text-slate-300">{seasonOver ? 'A temporada terminou.' : 'Sem jogos agendados.'}</p>
        )}
      </Card>

      <Card title={`Classificação · ${competition.name}`}>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-4xl font-bold tabular-nums">{row && row.played > 0 ? `${position}º` : "–"}</span>
            <span className="ml-1 text-slate-400">de {table.length}</span>
          </div>
          <div className="text-right text-sm text-slate-300">
            <div className="text-2xl font-bold tabular-nums">{row?.points ?? 0} pts</div>
            <div className="text-xs text-slate-400">
              {row?.played ?? 0} J · {row?.wins ?? 0} V · {row?.draws ?? 0} E · {row?.losses ?? 0} D · SG {row?.goalDifference ?? 0}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">Meta da diretoria: {team.objective.targetPosition}º lugar</p>
      </Card>

      {last && (
        <Card title="Último jogo">
          <MatchLine game={game} match={last} />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{formatDate(last.date)}</span>
            {lastOutcome && (
              <span className={`rounded-full px-2 py-0.5 font-bold ${OUTCOME_COLOR[lastOutcome]}`}>
                {OUTCOME_SHORT_LABELS[lastOutcome]} · {OUTCOME_LABELS[lastOutcome]}
              </span>
            )}
          </div>
        </Card>
      )}

      <div className="sticky bottom-20 pt-2">
        <Button className="w-full text-lg shadow-lg" onClick={advance} disabled={seasonOver}>
          {seasonOver ? SEASON_PHASE_LABELS['end-of-season'] : pending ? 'Ir para a partida' : 'Avançar'}
        </Button>
      </div>
    </div>
  )
}
