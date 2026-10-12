import type { DepartedPlayer, MarketNotice, Match, OffseasonReport } from '../../engine/types'
import {
  advanceGame,
  boardOf,
  lastUserMatch,
  nextEventOf,
  nextUserMatch,
  startNextSeason,
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
import { BOARD_STATUS_LABELS, OUTCOME_LABELS, OUTCOME_SHORT_LABELS, WINDOW_LABELS } from '../labels'

const BOARD_TONE = { safe: 'text-emerald-300', warning: 'text-amber-300', danger: 'text-rose-300' } as const
const BOARD_BAR = { safe: 'bg-emerald-500', warning: 'bg-amber-400', danger: 'bg-rose-500' } as const
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
function noticeText(n: MarketNotice): string {
  switch (n.type) {
    case 'window-opened': return `Janela de transferências aberta: ${WINDOW_LABELS[n.window]}.`
    case 'window-last-day': return `Último dia da janela: ${WINDOW_LABELS[n.window]}.`
    case 'offer-answered': return 'Uma proposta sua foi respondida.'
    case 'offer-received': return 'Você recebeu uma proposta por um jogador.'
  }
}

function SeasonReport({ game, report }: { game: Game; report: OffseasonReport }) {
  const name = (id: string) => teamById(game, id).name
  const mine = report.finalPositions[game.userTeamId]
  const gone = (list: DepartedPlayer[]) => list.filter((d) => d.teamId === game.userTeamId)
  const youth = report.youth[game.userTeamId] ?? 0
  const reputation = report.reputationChanges[game.userTeamId]
  return (
    <Card title={`Temporada ${report.year} encerrada`}>
      <ul className="space-y-1 text-sm">
        <li>Campeão da Série A: <b>{name(report.champions[0] as string)}</b></li>
        <li>Campeão da Série B: <b>{name(report.champions[1] as string)}</b></li>
        <li className="text-emerald-300">Subiram: {report.promoted.map(name).join(', ')}</li>
        <li className="text-rose-300">Caíram: {report.relegated.map(name).join(', ')}</li>
        {mine && <li>Seu time terminou em {mine.position}º na Série {mine.tier === 1 ? 'A' : 'B'}.</li>}
        {reputation && reputation.to !== reputation.from && <li>Reputação do clube: {reputation.from} → {reputation.to}.</li>}
        {gone(report.retired).length > 0 && <li>Aposentaram-se: {gone(report.retired).map((d) => `${d.name} (${d.age})`).join(', ')}.</li>}
        {gone(report.released).length > 0 && <li>Contratos vencidos: {gone(report.released).map((d) => d.name).join(', ')}.</li>}
        {youth > 0 && <li>{youth} {youth === 1 ? 'jovem subiu' : 'jovens subiram'} da base.</li>}
      </ul>
    </Card>
  )
}

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
  const board = boardOf(game)

  // Avança até o próximo dia de jogos; se o time do jogador joga nele, vai para a tela da partida.
  const advance = () => {
    if (seasonOver) return updateGame(startNextSeason)
    if (pending) return onNavigate('match')
    const moved = advanceGame(game)
    updateGame(() => moved)
    if (moved.pendingUserMatch) onNavigate('match')
  }

  return (
    <div className="space-y-3">
      {game.lastReport && <SeasonReport game={game} report={game.lastReport} />}

      {game.notices.length > 0 && (
        <Card title="Mercado">
          <ul className="space-y-1 text-sm">
            {game.notices.map((n, i) => (
              <li key={i}>{noticeText(n)}</li>
            ))}
          </ul>
          <button type="button" className="mt-2 min-h-12 text-sm font-semibold text-emerald-400" onClick={() => onNavigate('market')}>
            Abrir o mercado
          </button>
        </Card>
      )}

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

      <Card title="Diretoria">
        <div className="flex items-baseline justify-between">
          <span className={`text-sm font-semibold ${BOARD_TONE[board.status]}`}>{BOARD_STATUS_LABELS[board.status]}</span>
          <span className="text-sm tabular-nums text-slate-300">{Math.round(board.confidence)}/100</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
          <div className={`h-full ${BOARD_BAR[board.status]}`} style={{ width: `${board.confidence}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Você faz {board.pointsPerGame.toFixed(2)} pontos por jogo; a meta pede {board.targetPointsPerGame.toFixed(2)}. Abaixo do {team.objective.sackingPosition}º lugar você é demitido.
        </p>
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
        <Button className="w-full text-lg shadow-lg" onClick={advance}>
          {seasonOver ? 'Encerrar a temporada' : pending ? 'Ir para a partida' : 'Avançar'}
        </Button>
      </div>
    </div>
  )
}
