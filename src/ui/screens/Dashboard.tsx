import { useState } from 'react'
import { OpponentOverlay } from '../components/OpponentOverlay'
import { devFlag } from './match/pitchModel'
import type { DepartedPlayer, Match, OffseasonReport } from '../../engine/types'
import { cashOutlook, monthlyPayroll } from '../../engine/finance'
import { pendingIncoming } from '../../engine/market'
import {
  academyAlert,
  advanceGame,
  boardOf,
  lastYearContracts,
  lastUserMatch,
  nextEventOf,
  nextUserMatch,
  squadOf,
  startNextSeason,
  standingsOf,
  teamById,
  teamStrength,
  tierName,
  userCompetition,
  userIndividualTraining,
  userTeam,
  userTrainingPlan,
} from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { Card } from '../components/ui'
import { dateParts, daysBetween, formatCompactMoney, formatDate, formatMoney, outcomeFor } from '../format'
import type { ScreenId } from '../navigation'
import { BOARD_STATUS_LABELS, OUTCOME_LABELS, TRAINING_FOCUS_LABELS, TRAINING_INTENSITY_LABELS } from '../labels'
import { Highlights } from './dashboard/Highlights'
import { MiniTable } from './dashboard/MiniTable'
import { NoticeCenter } from './dashboard/NoticeCenter'
import { dashboardNotices } from './dashboard/notices'
import { isUnavailable } from '../squadSort'
import { teamForm } from './standings/data'
import { Crest, Eyebrow, Icon, Panel, ProgressBar, ResultDot, SegmentedBar, ShortcutTile } from '../theme'

const BOARD_CHIP = { safe: 'border-win/40 bg-win/10 text-win', warning: 'border-amber-300/40 bg-amber-300/10 text-amber-300', danger: 'border-loss/40 bg-loss/10 text-loss' } as const
const BAR_TONE = { safe: 'accent', warning: 'warning', danger: 'danger' } as const

/** Treino atual: intensidade, foco e a vaga individual. */
function TrainingCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const plan = userTrainingPlan(game)
  const slot = userIndividualTraining(game)
  const trainee = slot ? squadOf(game, game.userTeamId).find((p) => p.id === slot.playerId) : undefined
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>Treino</Eyebrow>
        <button type="button" className="min-h-10 text-sm font-bold text-accent" onClick={onOpen}>
          Mudar
        </button>
      </div>
      <div className="title mt-1 text-3xl">
        {TRAINING_INTENSITY_LABELS[plan.intensity]} · {TRAINING_FOCUS_LABELS[plan.focus]}
      </div>
      <p className="text-sm text-muted">
        {trainee && slot ? `Individual: ${trainee.nickname ?? trainee.name}, faltam ${slot.daysLeft} dias.` : 'Vaga de treino individual livre.'}
      </p>
    </Panel>
  )
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
        {report.champions.map((id, i) => <li key={id}>Campeão da {tierName(game, i + 1)}: <b>{name(id)}</b></li>)}
        <li className="text-win">Subiram: {report.promoted.map(name).join(', ')}</li>
        <li className="text-loss">Caíram: {report.relegated.map(name).join(', ')}</li>
        {mine && <li>Seu time terminou em {mine.position}º na {tierName(game, mine.tier)}.</li>}
        {reputation && reputation.to !== reputation.from && <li>Reputação do clube: {reputation.from} → {reputation.to}.</li>}
        {gone(report.retired).length > 0 && <li>Aposentaram-se: {gone(report.retired).map((d) => `${d.name} (${d.age})`).join(', ')}.</li>}
        {gone(report.released).length > 0 && <li>Contratos vencidos: {gone(report.released).map((d) => d.name).join(', ')}.</li>}
        {report.preContracts?.filter((c) => c.toTeamId === game.userTeamId).map((c) => <li key={`in-${c.playerId}`} className="text-win">Chegou de graça por pré-contrato: {game.season.players.find((p) => p.id === c.playerId)?.name ?? c.playerId}.</li>)}
        {report.preContracts?.filter((c) => c.fromTeamId === game.userTeamId).map((c) => <li key={`out-${c.playerId}`} className="text-loss">Saiu por pré-contrato: {game.season.players.find((p) => p.id === c.playerId)?.name ?? c.playerId} ({teamById(game, c.toTeamId).name}).</li>)}
        {youth > 0 && <li>{youth} {youth === 1 ? 'jovem subiu' : 'jovens subiram'} da base.</li>}
      </ul>
    </Card>
  )
}

const inDays = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`)

/** Bolinha de resultado do último jogo e placar com as siglas, no ponto de vista do mandante. */
function LastMatchCard({ game, match }: { game: Game; match: Match }) {
  const team = userTeam(game)
  const home = teamById(game, match.homeTeamId)
  const away = teamById(game, match.awayTeamId)
  const opponent = home.id === team.id ? away : home
  const outcome = outcomeFor(match, team.id)
  const result = match.result
  const competition = userCompetition(game)
  const capacity = home.stadium.capacity
  const income = home.id === team.id ? team.finances.ledger.find((e) => e.category === 'ticket-sales' && e.date === match.date)?.amount : undefined
  return (
    <Panel className="p-4">
      <Eyebrow>Último jogo</Eyebrow>
      <div className="mt-3 flex items-center gap-3">
        {outcome && <ResultDot outcome={outcome} size="lg" />}
        <div className="min-w-0 flex-1">
          <div className="title flex items-center gap-2 text-3xl tabular-nums">
            <span>{home.abbreviation}</span>
            <span>{result?.homeGoals} – {result?.awayGoals}</span>
            <span>{away.abbreviation}</span>
          </div>
          <div className="truncate text-sm text-muted">
            {competition.name} · {home.id === team.id ? 'em casa' : 'fora'} contra {opponent.name}
            {outcome && <span className="sr-only"> ({OUTCOME_LABELS[outcome]})</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-muted">
        <Icon name="stadium" size={18} />
        {match.attendance !== undefined ? (
          <span>
            {match.attendance.toLocaleString('pt-BR')} ({Math.round((100 * match.attendance) / capacity)}%)
            {income !== undefined && <> · renda {formatMoney(income)}</>}
          </span>
        ) : (
          <span>{formatDate(match.date)}</span>
        )}
      </div>
    </Panel>
  )
}

/** Painel principal (aba Clube): situação do time, próximo jogo e o botão de avançar, atalhos, diretoria e orçamento. */
export function Dashboard({ game, onNavigate }: { game: Game; onNavigate: (screen: ScreenId, tab?: string) => void }) {
  const [opponentOpen, setOpponentOpen] = useState(() => devFlag('oponente'))
  const team = userTeam(game)
  const competition = userCompetition(game)
  const table = standingsOf(game, competition)
  const position = table.findIndex((r) => r.teamId === team.id) + 1
  const row = table[position - 1]
  const next = nextUserMatch(game)
  const last = lastUserMatch(game)
  const state = game.season
  const today = state.season.currentDate
  const seasonOver = nextEventOf(game).type === 'season-end'
  const opponent = next ? teamById(game, next.homeTeamId === team.id ? next.awayTeamId : next.homeTeamId) : undefined
  const opponentPosition = opponent ? table.findIndex((r) => r.teamId === opponent.id) + 1 : 0
  const opponentRow = table[opponentPosition - 1]
  const opponentForm = opponent ? teamForm(state.matches.filter((m) => m.competitionId === competition.id), opponent.id, 5) : []

  const pending = game.pendingUserMatch
  const academy = academyAlert(game)
  const board = boardOf(game)
  const expiring = lastYearContracts(game)
  const incoming = pendingIncoming(state)
  const notices = dashboardNotices(game)

  const squad = squadOf(game, team.id)
  const byId = new Map(squad.map((p) => [p.id, p]))
  const starters = team.tactic.startingXI.map((id) => byId.get(id)).filter((p) => p !== undefined)
  const condition = starters.length ? Math.round(starters.reduce((sum, p) => sum + p.condition.fitness, 0) / starters.length) : 0

  const finishedMine = state.matches
    .filter((m) => m.status === 'finished' && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
  const form = finishedMine.slice(-5).map((m) => outcomeFor(m, team.id)).filter((o) => o !== undefined)
  const totalRounds = (table.length - 1) * 2

  const payroll = monthlyPayroll(squad)
  const unavailableCount = squad.filter(isUnavailable).length
  const starterOut = starters.some(isUnavailable)
  const preContractLost = game.notices.some((n) => n.type === 'pre-contract-lost')
  const seasonEnd = state.matches[state.matches.length - 1]?.date ?? today
  const outlook = cashOutlook(team, payroll, today, seasonEnd)
  const financeAlert = outlook.alerts.length > 0
  const salaryBudget = team.finances.salaryBudget
  const when = dateParts(today)

  // Avança até o próximo dia de jogos; se o time do jogador joga nele, vai para a tela da partida.
  const advance = () => {
    if (academy.pending > 0) return onNavigate('academy')
    if (seasonOver) {
      if (expiring.length > 0 && !window.confirm(`${expiring.length} contrato(s) vencem agora e esses jogadores vão embora. Encerrar a temporada mesmo assim?`)) return
      return updateGame(startNextSeason)
    }
    if (pending) return onNavigate('match')
    const moved = advanceGame(game)
    updateGame(() => moved)
    if (moved.pendingUserMatch) onNavigate('match')
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-4">
        <Crest team={team} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="title line-clamp-2 text-4xl sm:text-5xl">{team.name}</h1>
          <p className="text-sm text-muted">{competition.name} · {team.stadium.name}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3">
          <Icon name="trophy" size={16} className="text-muted" />
          {row && row.played > 0 ? `${position}º` : '–'}
        </span>
        <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3">{row?.points ?? 0} pts</span>
        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3">
          <Icon name="calendar" size={16} className="text-muted" />
          {row?.played ?? 0}/{totalRounds}
        </span>
        <span className="flex items-center gap-1" aria-label="Últimos 5 resultados">
          {form.map((o, i) => (
            <ResultDot key={i} outcome={o} />
          ))}
        </span>
        <span className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 tabular-nums" title="Saldo em caixa">
          <Icon name="finance" size={16} className="text-muted" />
          {formatCompactMoney(team.finances.balance)}
        </span>
      </div>

      <NoticeCenter notices={notices} onOpen={onNavigate} />

      {game.lastReport && <SeasonReport game={game} report={game.lastReport} />}

      <Panel striped cut className="p-5">
        <div className="flex items-end gap-3">
          <span className="title text-7xl tabular-nums">{when.day}</span>
          <div className="pb-1.5 leading-tight">
            <div className="title text-2xl">
              {when.month} <span className="text-muted">{when.weekday}</span>
            </div>
            <div className="text-sm font-bold text-muted">{when.year}</div>
          </div>
        </div>

        <div className="mt-6">
          <Eyebrow>Próximo jogo</Eyebrow>
          {next && opponent ? (
            <>
              <button type="button" onClick={() => setOpponentOpen(true)} aria-label={`Ver a tática de ${opponent.name}`} className="mt-2 flex w-full items-center gap-3 text-left">
                <Crest team={opponent} size="md" />
                <div className="min-w-0">
                  <div className="title line-clamp-2 text-3xl">{opponent.name}</div>
                  <div className="text-sm text-muted">
                    {competition.name} · rodada {next.round} · {next.homeTeamId === team.id ? 'em casa' : 'fora'} · {inDays(daysBetween(today, next.date))}
                  </div>
                </div>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="opponent-form">
                <span className="font-bold">{opponentRow && opponentRow.played > 0 ? `${opponentPosition}º` : '–'} · {opponentRow?.points ?? 0} pts</span>
                <span className="flex items-center gap-1" aria-label={`Forma de ${opponent.name}`}>
                  {opponentForm.map((o, i) => (
                    <ResultDot key={i} outcome={o} />
                  ))}
                </span>
              </div>
              <button type="button" onClick={() => setOpponentOpen(true)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-accent/60 text-sm font-bold text-accent">
                <Icon name="tactics" size={18} />
                Ver tática e escalação provável
              </button>
              {opponentOpen && <OpponentOverlay game={game} teamId={opponent.id} onClose={() => setOpponentOpen(false)} />}
              <div className="mt-2 text-xs text-muted">
                Força dos titulares: {teamStrength(game, team).toFixed(0)} (você) x {teamStrength(game, opponent).toFixed(0)} ({opponent.abbreviation})
              </div>
            </>
          ) : (
            <p className="mt-2 text-lg font-bold">{seasonOver ? 'A temporada terminou.' : 'Sem jogos agendados.'}</p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-slate-200">
          <Icon name="heart" size={18} className="text-muted" />
          Condição média dos titulares: <b className="tabular-nums">{condition}</b>
        </div>

        <button
          type="button"
          onClick={advance}
          className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-accent font-display text-2xl font-extrabold uppercase tracking-wide text-accent-ink transition hover:brightness-110 active:scale-[0.98]"
        >
          {academy.pending > 0 ? 'Decidir sobre a base' : seasonOver ? 'Encerrar a temporada' : pending ? 'Ir para a partida' : 'Avançar'}
        </button>
      </Panel>

      <div className="grid grid-cols-5 gap-1.5" data-testid="shortcuts">
        <ShortcutTile icon="squad" label="Elenco" tone="sky" alert={unavailableCount > 0} onClick={() => onNavigate('squad', 'players')} />
        <ShortcutTile icon="lineup" label="Escalação" tone="teal" alert={starterOut} onClick={() => onNavigate('squad', 'lineup')} />
        <ShortcutTile icon="tactics" label="Tática" tone="amber" onClick={() => onNavigate('tactics')} />
        <ShortcutTile icon="sprout" label="Base" tone="teal" alert={academy.pending > 0 || academy.arrivals > 0} onClick={() => onNavigate('academy')} />
        <ShortcutTile icon="dumbbell" label="Treino" tone="rose" onClick={() => onNavigate('training')} />
        <ShortcutTile icon="market" label="Mercado" tone="rose" alert={incoming.length > 0 || preContractLost} onClick={() => onNavigate('market', incoming.length > 0 ? 'proposals' : preContractLost ? 'precontract' : undefined)} />
        <ShortcutTile icon="contract" label="Contratos" tone="slate" alert={expiring.length > 0} onClick={() => onNavigate('contracts')} />
        <ShortcutTile icon="finance" label="Finanças" tone="teal" alert={financeAlert} onClick={() => onNavigate('finance')} />
        <ShortcutTile icon="table" label="Tabela" tone="violet" onClick={() => onNavigate('standings')} />
        <ShortcutTile icon="history" label="Histórico" tone="slate" onClick={() => onNavigate('standings', 'history')} />
      </div>

      <MiniTable game={game} competition={competition} onOpen={() => onNavigate('standings')} />

      <Highlights game={game} onOpen={() => onNavigate('squad', 'players')} />

      <TrainingCard game={game} onOpen={() => onNavigate('training')} />

      {last && <LastMatchCard game={game} match={last} />}

      <Panel className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow>Diretoria</Eyebrow>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${BOARD_CHIP[board.status]}`}>{BOARD_STATUS_LABELS[board.status]}</span>
        </div>
        <div className="title mt-2 text-4xl">Meta: {team.objective.targetPosition}º lugar</div>
        <p className="text-sm text-muted">Abaixo do {team.objective.sackingPosition}º lugar você é demitido.</p>
        <div className="mt-3 flex items-center justify-between text-sm font-bold">
          <span className="text-accent">Hoje {row && row.played > 0 ? `${position}º` : '–'}</span>
          <span>meta ≤ {team.objective.targetPosition}º</span>
        </div>
        <div className="mt-1.5">
          <SegmentedBar
            total={table.length}
            lit={team.objective.targetPosition}
            current={row && row.played > 0 ? position : undefined}
            marker={team.objective.targetPosition}
            label={`Posição ${position} de ${table.length}, meta ${team.objective.targetPosition}`}
          />
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Confiança da diretoria</span>
          <span className="font-bold tabular-nums">{Math.round(board.confidence)}/100</span>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={board.confidence} tone={BAR_TONE[board.status]} label="Confiança da diretoria" />
        </div>
        <p className="mt-2 text-xs text-muted">
          Você faz {board.pointsPerGame.toFixed(2)} pontos por jogo; a meta pede {board.targetPointsPerGame.toFixed(2)}.
        </p>
      </Panel>

      <Panel className="p-4">
        <Eyebrow>Orçamento</Eyebrow>
        <div className="mt-3">
          <ProgressBar value={salaryBudget > 0 ? (100 * payroll) / salaryBudget : 100} tone="striped" height="h-4" label="Folha salarial no orçamento" />
        </div>
        <div className="mt-2 flex items-start justify-between gap-3 text-sm">
          <div>
            <div className="whitespace-nowrap font-bold text-pink-300">Folha {formatCompactMoney(payroll)}</div>
            <div className="text-xs text-muted">por mês, de {formatCompactMoney(salaryBudget)}<br />folga {formatCompactMoney(salaryBudget - payroll)}</div>
          </div>
          <div className="text-right">
            <div className="whitespace-nowrap font-bold text-accent">Compras {formatCompactMoney(team.finances.transferBudget)}</div>
            <div className="text-xs text-muted">para transferências</div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
