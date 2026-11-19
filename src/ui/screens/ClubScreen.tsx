import { useMemo } from 'react'
import { BOARD } from '../../engine/config'
import { coachStanding, fanMood } from '../../engine/clubView'
import { cycleOfPyramid, pyramidOfTeamId } from '../../engine/season/cycles'
import { squadRoom } from '../../engine/squadRoom'
import { boardOf, coachOf, squadOf, standingsOf, userCompetition, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { formatDate, formatMoney } from '../format'
import { BOARD_STATUS_LABELS, MOOD_BAND_LABELS, OBJECTIVE_TEXT, PROMISE_LABELS, ROOM_CHEMISTRY_LABELS } from '../labels'
import { Eyebrow, Panel } from '../theme'

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
    <span className="text-muted">{label}</span>
    <span className="text-right font-bold">{children}</span>
  </div>
)

const Gauge = ({ value, tone }: { value: number; tone: string }) => (
  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round(value)} de 100`}>
    <span className={`block h-full ${tone}`} style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
  </span>
)

/**
 * O clube: como a diretoria, a torcida e o vestiário veem o técnico, a arquibancada, a linha do tempo do ano e o ranking do técnico no mercado.
 * Só leitura (tudo derivado; nada aqui muda o jogo). Eleições, patrocinador e aposta do ano ficam fora desta versão.
 */
export function ClubScreen({ game }: { game: Game }) {
  const team = userTeam(game)
  const competition = userCompetition(game)
  const table = standingsOf(game, competition)
  const index = table.findIndex((r) => r.teamId === team.id)
  const board = boardOf(game)
  const coach = coachOf(game)
  const squad = squadOf(game, team.id)
  const room = useMemo(() => squadRoom(team, squad, team), [team, squad])
  const mood = useMemo(() => fanMood(game.season.matches, team.id, index + 1, team.objective.targetPosition), [game.season.matches, team.id, index, team.objective.targetPosition])
  const standing = useMemo(() => coachStanding(coach.reputation, game.season.teams.filter((t) => competition.teamIds.includes(t.id))), [coach.reputation, game.season.teams, competition.teamIds])
  const pyramid = pyramidOfTeamId(game.season, team.id)
  const end = pyramid ? cycleOfPyramid(game.season, pyramid).end : undefined
  const home = game.season.matches.filter((m) => m.status === 'finished' && m.homeTeamId === team.id && m.attendance !== undefined && m.cup === undefined)
  const gate = home.length ? Math.round(home.reduce((s, m) => s + (m.attendance ?? 0), 0) / home.length) : null
  const played = table[index]?.played ?? 0
  const statusTone = board.status === 'safe' ? 'bg-win' : board.status === 'warning' ? 'bg-amber' : 'bg-loss'
  const moodTone = mood.value >= 55 ? 'bg-win' : mood.value >= 35 ? 'bg-amber' : 'bg-loss'
  return (
    <div className="space-y-3" data-testid="club-screen">
      <h2 className="font-display text-[26px] font-bold leading-none">{team.name}</h2>

      <Panel striped cut className="p-4" data-testid="club-views">
        <Eyebrow>Como te veem</Eyebrow>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 px-1 py-2" data-testid="view-board">
            <div className="title text-2xl leading-tight">{Math.round(board.confidence)}</div>
            <div className="text-[11px] text-muted">Diretoria</div>
            <div className="text-[10px] font-semibold">{BOARD_STATUS_LABELS[board.status]}</div>
            <Gauge value={board.confidence} tone={statusTone} />
          </div>
          <div className="rounded-xl bg-surface-2 px-1 py-2" data-testid="view-fans">
            <div className="title text-2xl leading-tight">{mood.value}</div>
            <div className="text-[11px] text-muted">Torcida</div>
            <div className="text-[10px] font-semibold">{MOOD_BAND_LABELS[mood.band]}</div>
            <Gauge value={mood.value} tone={moodTone} />
          </div>
          <div className="rounded-xl bg-surface-2 px-1 py-2" data-testid="view-locker">
            <div className="title text-2xl leading-tight">{Math.round(room.morale)}</div>
            <div className="text-[11px] text-muted">Vestiário</div>
            <div className="text-[10px] font-semibold">{ROOM_CHEMISTRY_LABELS[room.chemistry]}</div>
            <Gauge value={room.morale} tone={room.morale >= 55 ? 'bg-win' : room.morale >= 40 ? 'bg-amber' : 'bg-loss'} />
          </div>
        </div>
      </Panel>

      <Panel className="p-4" data-testid="club-board">
        <Eyebrow>A diretoria</Eyebrow>
        <Row label="Pede">{OBJECTIVE_TEXT(team.objective.targetPosition)}</Row>
        <Row label="Perde a paciência">Abaixo do {team.objective.sackingPosition}º lugar</Row>
        <Row label="Sua posição hoje">{played > 0 ? `${index + 1}º de ${table.length}` : 'Antes do primeiro jogo'}</Row>
        <Row label="Sua promessa">{team.promise && team.promise.year === game.season.season.year ? PROMISE_LABELS[team.promise.kind].title : 'Nenhuma'}</Row>
      </Panel>

      <Panel className="p-4" data-testid="club-stands">
        <Eyebrow>A arquibancada</Eyebrow>
        <Row label="Estádio">
          {team.stadium.name} · {team.stadium.capacity.toLocaleString('pt-BR')} lugares
        </Row>
        <Row label="Ingresso">{formatMoney(team.ticketPrice)}</Row>
        <Row label="Público médio em casa">{gate === null ? 'Ainda sem jogos em casa' : `${gate.toLocaleString('pt-BR')} (${Math.round((gate / team.stadium.capacity) * 100)}% do estádio)`}</Row>
        <Row label="Humor da torcida">{MOOD_BAND_LABELS[mood.band]}</Row>
      </Panel>

      <Panel className="p-4" data-testid="club-timeline">
        <Eyebrow>O ano</Eyebrow>
        <ul className="mt-2 space-y-2 text-sm">
          <li>
            {played >= BOARD.judgeAfterGames ? 'A diretoria já julga o time por inteiro.' : `A diretoria passa a julgar o time por inteiro depois de ${BOARD.judgeAfterGames} jogos (faltam ${Math.max(0, BOARD.judgeAfterGames - played)}).`}
          </li>
          {team.promise && team.promise.year === game.season.season.year && team.promise.kind !== 'none' && <li>Você prometeu à torcida: {PROMISE_LABELS[team.promise.kind].title.toLowerCase()}.</li>}
          {end && <li>A temporada termina em {formatDate(end)}.</li>}
        </ul>
      </Panel>

      <Panel className="p-4" data-testid="club-coach">
        <Eyebrow>O mercado vê você</Eyebrow>
        <Row label="Reputação como técnico">{coach.reputation.toFixed(1)} de 20</Row>
        <Row label="Clubes da liga que te alcançam">
          {standing.reachable} de {standing.total}
        </Row>
        <p className="mt-2 text-xs text-muted">Os clubes que procuram técnico olham a sua reputação e a confiança da diretoria. As propostas aparecem na tela de Carreira.</p>
      </Panel>
    </div>
  )
}
