import { useState } from 'react'
import { OpponentOverlay } from '../components/OpponentOverlay'
import { devFlag } from './match/pitchModel'
import type { DepartedPlayer, Match, OffseasonReport } from '../../engine/types'
import { matchLabel } from '../../engine/cups'
import { cashOutlook, monthlyPayroll } from '../../engine/finance'
import { pendingIncoming } from '../../engine/market'
import {
  academyAlert,
  boardOf,
  lastYearContracts,
  lastUserMatch,
  nextEventOf,
  nextUserMatch,
  squadOf,
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
import { runHeavy } from '../../store/heavy'
import { AdminShortcut } from './online/leagues/AdminShortcut'
import { LeagueCard } from './online/leagues/LeagueCard'
import { Card } from '../components/ui'
import { ReportProblem } from '../components/ReportProblem'
import { daysBetween, formatCompactMoney, formatDate, formatMoney, outcomeFor } from '../format'
import type { ScreenId } from '../navigation'
import { formationLabel, BOARD_STATUS_LABELS, OUTCOME_LABELS, TRAINING_FOCUS_LABELS, TRAINING_INTENSITY_LABELS } from '../labels'
import { Highlights } from './dashboard/Highlights'
import { CupCard } from './dashboard/CupCard'
import { MiniTable } from './dashboard/MiniTable'
import { NoticeCenter } from './dashboard/NoticeCenter'
import { dashboardNotices } from './dashboard/notices'
import { isUnavailable } from '../squadSort'
import { teamForm } from './standings/data'
import { Avatar, Crest, Eyebrow, Icon, Panel, ProgressBar, ResultDot, SegmentedBar, ShortcutTile, StadiumArt, TrophyArt } from '../theme'
import { MiniFormation } from './dashboard/MiniFormation'
import { playerOverall } from '../../engine/overall'

const BOARD_CHIP = { safe: 'border-accent/50 bg-accent/10 text-accent', warning: 'border-amber/50 bg-amber/10 text-amber', danger: 'border-loss/40 bg-loss/10 text-loss' } as const
const BAR_TONE = { safe: 'accent', warning: 'warning', danger: 'danger' } as const

/** Treino atual: intensidade, foco e a vaga individual. */
function TrainingCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const plan = userTrainingPlan(game)
  const slot = userIndividualTraining(game)
  const trainee = slot ? squadOf(game, game.userTeamId).find((p) => p.id === slot.playerId) : undefined
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow icon="dumbbell">Treino</Eyebrow>
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
    <Card title={`Temporada ${report.label ?? report.year} encerrada`}>
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

/** Nome do time no cartão: o curto (como a torcida chama) quando existe, para caber ao lado do escudo grande. */
const teamLabel = (t: { name: string; shortName?: string | undefined }) => t.shortName ?? t.name

const inDays = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`)

/** Bolinha de resultado do último jogo e placar com as siglas, no ponto de vista do mandante. */
function LastMatchCard({ game, match }: { game: Game; match: Match }) {
  const team = userTeam(game)
  const home = teamById(game, match.homeTeamId)
  const away = teamById(game, match.awayTeamId)
  const opponent = home.id === team.id ? away : home
  const outcome = outcomeFor(match, team.id)
  const result = match.result
  const capacity = home.stadium.capacity
  const income = home.id === team.id ? team.finances.ledger.find((e) => e.category === 'ticket-sales' && e.date === match.date)?.amount : undefined
  return (
    <Panel className="p-4">
      <Eyebrow icon="ball">Último jogo</Eyebrow>
      <div className="mt-3 flex items-center gap-3">
        {outcome && <ResultDot outcome={outcome} size="lg" />}
        <div className="min-w-0 flex-1">
          <div className="title flex items-center gap-2 text-3xl tabular-nums">
            <span>{home.abbreviation}</span>
            <span>{result?.homeGoals} – {result?.awayGoals}</span>
            <span>{away.abbreviation}</span>
          </div>
          <div className="truncate text-sm text-muted">
            {matchLabel(game.season, match).competition}{match.cup ? ` · ${matchLabel(game.season, match).detail}` : ''} · {home.id === team.id ? 'em casa' : 'fora'} contra {opponent.name}{match.result?.penalties ? ` (${match.result.penalties.home} x ${match.result.penalties.away} nos pênaltis)` : ''}
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
  const [reporting, setReporting] = useState(false)
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
  const seasonEnd = [...state.matches].reverse().find((m) => m.cup === undefined)?.date ?? today
  const outlook = cashOutlook(team, payroll, today, seasonEnd)
  const financeAlert = outlook.alerts.length > 0
  const salaryBudget = team.finances.salaryBudget

  // Avança até o próximo dia de jogos; se o time do jogador joga nele, vai para a tela da partida.
  const advance = () => {
    if (academy.pending > 0) return onNavigate('academy')
    if (seasonOver) {
      if (expiring.length > 0 && !window.confirm(`${expiring.length} contrato(s) vencem agora e esses jogadores vão embora. Encerrar a temporada mesmo assim?`)) return
      return void runHeavy('nextSeason')
    }
    if (pending) return onNavigate('match')
    // A pré-temporada, a virada e os mundos grandes calculam num Web Worker, com a tela de progresso.
    void runHeavy('advance').then((moved) => {
      if (moved?.pendingUserMatch) onNavigate('match')
    })
  }

  return (
    <div className="space-y-3">
      {game.lastReport && <SeasonReport game={game} report={game.lastReport} />}

      <section className="card-bg relative overflow-hidden rounded-[14px] border border-white/[0.13] p-3.5" data-testid="next-match">
        <StadiumArt className="pointer-events-none absolute inset-0 h-full w-full opacity-100 brightness-150 saturate-125" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/50" />
        <div className="relative">
          <div className="-mx-3.5 -mt-3.5 mb-3 flex items-stretch justify-between overflow-hidden border-b border-white/[0.07] bg-black/30">
            <span className="inline-flex items-center gap-2 bg-gradient-to-r from-[#1f9a3e] to-[#0c4f1e] py-2 pl-3.5 pr-7 font-display text-[19px] font-bold [clip-path:polygon(0_0,100%_0,calc(100%_-_16px)_100%,0_100%)]">
              <Icon name="trophy" size={20} className="text-[#bff5cb]" />
              Próximo jogo
            </span>
            {next && (
              <span className="flex items-center gap-1.5 self-center pr-3.5 text-[13px] font-semibold text-gold">
                <TrophyArt size={14} />
                {matchLabel(state, next).competition}
              </span>
            )}
          </div>
          {next && opponent ? (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 text-center">
                <div className="flex flex-col items-center gap-1">
                  <Crest team={team} size="xl" />
                  <span className="font-display text-[18px] font-bold leading-tight">{teamLabel(team)}</span>
                  <span className="text-xs text-slate-300">{row && row.played > 0 ? `${position}º` : '–'} · {row?.points ?? 0} pts</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-display text-[46px] font-extrabold leading-none">X</span>
                  <span className="font-display text-[15px] font-bold text-accent">{formatDate(next.date)}</span>
                  <span className="text-xs text-slate-300">{inDays(daysBetween(today, next.date))}</span>
                  <span className="mt-1 flex max-w-[7.5rem] items-center justify-center gap-1 text-[11.5px] text-slate-200" data-testid="stadium-name">
                    <Icon name="stadium" size={14} className="shrink-0" />
                    <span className="truncate">{teamById(game, next.homeTeamId).stadium.name}</span>
                  </span>
                </div>
                <button type="button" onClick={() => setOpponentOpen(true)} aria-label={`Ver a tática de ${opponent.name}`} className="flex flex-col items-center gap-1">
                  <Crest team={opponent} size="xl" />
                  <span className="font-display text-[18px] font-bold leading-tight">{teamLabel(opponent)}</span>
                  <span className="text-xs text-slate-300" data-testid="opponent-form">
                    {opponentRow && opponentRow.played > 0 ? `${opponentPosition}º` : '–'} · {opponentRow?.points ?? 0} pts
                    <span className="ml-1.5 inline-flex items-center gap-1 align-middle" aria-label={`Forma de ${opponent.name}`}>
                      {opponentForm.map((o, i) => (
                        <ResultDot key={i} outcome={o} />
                      ))}
                    </span>
                  </span>
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-slate-300">
                {matchLabel(state, next).detail} · {next.cup?.neutral ? 'campo neutro' : next.homeTeamId === team.id ? 'em casa' : 'fora'} · Força dos titulares: {teamStrength(game, team).toFixed(0)} (você) x {teamStrength(game, opponent).toFixed(0)} ({opponent.abbreviation})
              </p>
              <div className="mt-1.5 flex items-center justify-center gap-2 text-[13px] text-slate-200">
                <Icon name="heart" size={16} className="text-muted" />
                Condição média dos titulares: <b className="tabular-nums text-accent">{condition}</b>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setOpponentOpen(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-accent bg-black/40 px-2 text-center font-display text-base font-bold leading-tight">
                  <Icon name="tactics" size={18} className="text-accent" />
                  Ver tática e escalação provável
                </button>
                <button type="button" onClick={() => onNavigate('tactics')} className="btn-dark flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-2 font-display text-base font-bold">
                  <Icon name="tactics" size={18} className="text-accent" />
                  Tática
                </button>
              </div>
              {opponentOpen && <OpponentOverlay game={game} teamId={opponent.id} onClose={() => setOpponentOpen(false)} />}
            </>
          ) : (
            <p className="py-6 text-center text-lg font-bold">{seasonOver ? 'A temporada terminou.' : 'Sem jogos agendados.'}</p>
          )}

          {game.online ? (
            // Na liga online quem avança o tempo é a liga: no lugar do botão Avançar entra o cartão da liga (Pronto e sala).
            <LeagueCard leagueId={game.online.leagueId} teamId={game.userTeamId} onOpen={() => onNavigate('league')} onWatch={() => onNavigate('match')} onCareer={() => onNavigate('career')} />
          ) : (
            <>
              {pending && (
                <button type="button" onClick={() => onNavigate('match')} className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-accent bg-black/45 font-display text-[19px] font-bold shadow-[inset_0_0_18px_rgb(39_224_90/0.18)]">
                  <Icon name="play" size={20} className="text-accent" />
                  Preparar partida
                </button>
              )}
              <button
                type="button"
                onClick={advance}
                className="btn-primary mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-[10px] font-display text-[21px] font-bold uppercase tracking-wide transition active:scale-[0.98]"
              >
                <Icon name="ffwd" size={22} />
                {academy.pending > 0 ? 'Decidir sobre a base' : seasonOver ? 'Encerrar a temporada' : pending ? 'Ir para a partida' : 'Avançar'}
              </button>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-sm font-bold" data-testid="form-strip">
        <span className="card-bg inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/[0.13] px-3">
          <Icon name="trophy" size={15} className="text-accent" />
          {row && row.played > 0 ? `${position}º` : '–'}
        </span>
        <span className="card-bg inline-flex min-h-8 items-center rounded-full border border-white/[0.13] px-3">{row?.points ?? 0} pts</span>
        <span className="card-bg inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/[0.13] px-3">
          <Icon name="calendar" size={15} className="text-accent" />
          {row?.played ?? 0}/{totalRounds}
        </span>
        <span className="ml-auto flex items-center gap-1" aria-label="Últimos 5 resultados">
          {form.map((o, i) => (
            <ResultDot key={i} outcome={o} />
          ))}
        </span>
      </div>

      <MiniTable game={game} competition={competition} onOpen={() => onNavigate('standings', 'table')} />

      <NoticeCenter notices={notices} onOpen={onNavigate} />

      <div className="grid grid-cols-3 gap-2" data-testid="trio">
        <button type="button" onClick={() => onNavigate('finance')} className="relative flex min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-xl border border-accent/40 bg-gradient-to-br from-[#0f3a1c] to-[#07140b] p-2.5 text-left">
          <span className="flex items-center gap-1.5 font-display text-[15px] font-bold">
            <Icon name="dollar" size={18} className="text-accent" />
            Finanças
          </span>
          <span className="max-w-full truncate font-display text-[17px] font-bold leading-tight text-accent">{formatCompactMoney(team.finances.balance)}</span>
          <span className="text-[11px] text-muted">Saldo em caixa</span>
          <svg viewBox="0 0 60 30" className="pointer-events-none absolute -bottom-0.5 right-0 h-8 w-14 text-accent" aria-hidden="true">
            {[8, 13, 10, 18, 22, 28].map((h, i) => (
              <rect key={i} x={i * 10 + 1} y={30 - h} width="7" height={h} rx="1" fill="currentColor" opacity={0.3 + i * 0.12} />
            ))}
          </svg>
        </button>
        <button type="button" onClick={() => onNavigate('squad', 'players')} className="card-bg relative flex min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-xl border border-white/[0.13] p-2.5 text-left">
          <span className="flex items-center gap-1.5 font-display text-[15px] font-bold">
            <Icon name="squad" size={18} className="text-accent" />
            Elenco
          </span>
          <span className="max-w-full truncate font-display text-[17px] font-bold leading-tight">{squad.length} jogadores</span>
          <span className="text-[11px] text-muted">no elenco</span>
          <span className="pointer-events-none absolute bottom-1 right-1 flex -space-x-2.5 opacity-70" aria-hidden="true">
            {[...squad]
              .sort((x, y) => playerOverall(y) - playerOverall(x))
              .slice(0, 3)
              .map((p) => (
                <Avatar key={p.id} id={p.id} colors={team.colors} size={22} ring />
              ))}
          </span>
        </button>
        <button type="button" onClick={() => onNavigate('tactics')} className="card-bg relative flex min-w-0 flex-col items-start gap-0.5 overflow-hidden rounded-xl border border-white/[0.13] p-2.5 text-left">
          <span className="flex items-center gap-1.5 font-display text-[15px] font-bold">
            <Icon name="tactics" size={18} className="text-accent" />
            Tática
          </span>
          <span className="max-w-full truncate font-display text-[17px] font-bold leading-tight">{formationLabel(team.tactic.formationId)}</span>
          <span className="text-[11px] text-muted">Formação principal</span>
          <MiniFormation tactic={team.tactic} className="pointer-events-none absolute bottom-1 right-1.5 h-11 w-8" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1.5" data-testid="shortcuts">
        <ShortcutTile icon="squad" label="Elenco" tone="sky" alert={unavailableCount > 0} onClick={() => onNavigate('squad', 'players')} />
        <ShortcutTile icon="lineup" label="Escalação" tone="teal" alert={starterOut} onClick={() => onNavigate('squad', 'lineup')} />
        <ShortcutTile icon="tactics" label="Tática" tone="amber" onClick={() => onNavigate('tactics')} />
        <ShortcutTile icon="sprout" label="Base" tone="teal" alert={academy.pending > 0 || academy.arrivals > 0} onClick={() => onNavigate('academy')} />
        <ShortcutTile icon="dumbbell" label="Treino" tone="rose" onClick={() => onNavigate('training')} />
        <ShortcutTile icon="market" label="Mercado" tone="rose" alert={incoming.length > 0 || preContractLost} onClick={() => onNavigate('market', incoming.length > 0 ? 'proposals' : preContractLost ? 'precontract' : undefined)} />
        <ShortcutTile icon="contract" label="Contratos" tone="slate" alert={expiring.length > 0} onClick={() => onNavigate('contracts')} />
        <ShortcutTile icon="finance" label="Finanças" tone="teal" alert={financeAlert} onClick={() => onNavigate('finance')} />
        <ShortcutTile icon="table" label="Tabela" tone="violet" onClick={() => onNavigate('standings', 'table')} />
        <ShortcutTile icon="history" label="Histórico" tone="slate" onClick={() => onNavigate('standings', 'history')} />
        {game.online && <AdminShortcut leagueId={game.online.leagueId} onClick={() => onNavigate('admin')} />}
      </div>

      <CupCard game={game} onOpen={() => onNavigate('standings', 'cups')} />

      <Highlights game={game} onOpen={() => onNavigate('squad', 'players')} />

      <TrainingCard game={game} onOpen={() => onNavigate('training')} />

      {last && <LastMatchCard game={game} match={last} />}

      <Panel className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow icon="shield">Diretoria</Eyebrow>
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
        <Eyebrow icon="finance">Orçamento</Eyebrow>
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

      <button type="button" className="min-h-12 w-full rounded-xl text-sm text-muted underline" onClick={() => setReporting(true)} data-testid="report-problem">
        Relatar problema
      </button>
      {reporting && <ReportProblem context={{ screen: 'clube', mode: 'solo', worldSource: game.dataPackage?.id.split(':')[1] ?? 'ficticio', season: String(game.season.season.year), phase: game.season.season.phase }} onClose={() => setReporting(false)} />}
    </div>
  )
}
