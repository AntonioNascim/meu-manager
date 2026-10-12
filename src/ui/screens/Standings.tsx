import { useMemo, useState } from 'react'
import type { Competition, Match, StandingRow } from '../../engine/types'
import { competitionMatches, standingsOf, teamById } from '../../store/game'
import type { Game } from '../../store/game'
import { Tabs, TeamBadge } from '../components/ui'
import { formatDate } from '../format'
import { TIER_LABELS, ZONE_LABELS } from '../labels'
import type { Zone } from '../labels'

type View = 'table' | 'results'

/** Zona de uma posição (1 a N): acesso no topo da Série B, rebaixamento no fim da Série A. */
export function zoneOf(position: number, size: number, competition: Pick<Competition, 'promotionSlots' | 'relegationSlots'>): Zone | null {
  if (position <= competition.promotionSlots) return 'promotion'
  if (position > size - competition.relegationSlots) return 'relegation'
  return null
}

const ZONE_STYLE: Record<Zone, { bar: string; dot: string }> = {
  promotion: { bar: 'border-l-4 border-emerald-400', dot: 'bg-emerald-400' },
  relegation: { bar: 'border-l-4 border-rose-500', dot: 'bg-rose-500' },
}

/** Última rodada com algum jogo disputado (a rodada "atual" para mostrar os resultados). */
export function latestPlayedRound(matches: readonly Match[]): number {
  return matches.reduce((round, m) => (m.status === 'finished' ? Math.max(round, m.round) : round), 1)
}

function Table({ game, competition }: { game: Game; competition: Competition }) {
  const rows: StandingRow[] = useMemo(() => standingsOf(game, competition), [game, competition])
  const started = rows.some((r) => r.played > 0)
  const zonesUsed = new Set<Zone>()
  return (
    <div>
      <div className="flex items-center gap-1 rounded-t-xl bg-slate-800 px-2 py-2 text-[11px] font-semibold uppercase text-slate-400">
        <span className="w-6 text-center">#</span>
        <span className="flex-1 pl-1">Time</span>
        {['J', 'V', 'E', 'D', 'SG', 'Pts'].map((h) => (
          <span key={h} className={`${h === 'SG' ? 'w-8' : h === 'Pts' ? 'w-9' : 'w-6'} text-center`}>
            {h}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-slate-800 rounded-b-xl bg-slate-800/50">
        {rows.map((row, i) => {
          const team = teamById(game, row.teamId)
          const zone = zoneOf(i + 1, rows.length, competition)
          if (zone) zonesUsed.add(zone)
          const mine = row.teamId === game.userTeamId
          return (
            <li
              key={row.teamId}
              className={`flex min-h-11 items-center gap-1 px-2 py-1 text-sm ${zone ? ZONE_STYLE[zone].bar : 'border-l-4 border-transparent'} ${mine ? 'bg-emerald-600/20 font-semibold' : ''}`}
              aria-label={zone ? ZONE_LABELS[zone] : undefined}
            >
              <span className="w-6 text-center text-xs tabular-nums text-slate-300">{started ? i + 1 : '–'}</span>
              <span className="flex min-w-0 flex-1 items-center gap-2 pl-1">
                <TeamBadge team={team} size="sm" />
                <span className="truncate">{team.name}</span>
              </span>
              <span className="w-6 text-center tabular-nums text-slate-300">{row.played}</span>
              <span className="w-6 text-center tabular-nums text-slate-300">{row.wins}</span>
              <span className="w-6 text-center tabular-nums text-slate-300">{row.draws}</span>
              <span className="w-6 text-center tabular-nums text-slate-300">{row.losses}</span>
              <span className="w-8 text-center tabular-nums text-slate-300">{row.goalDifference}</span>
              <span className="w-9 text-center font-bold tabular-nums">{row.points}</span>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
        {(['promotion', 'relegation'] as Zone[])
          .filter((z) => zonesUsed.has(z))
          .map((z) => (
            <span key={z} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${ZONE_STYLE[z].dot}`} /> {ZONE_LABELS[z]}
              {z === 'promotion' ? ` (${competition.promotionSlots} primeiros)` : ` (${competition.relegationSlots} últimos)`}
            </span>
          ))}
        <span>Desempate: pontos, vitórias, saldo, gols pró, confronto direto, cartões</span>
      </div>
    </div>
  )
}

function Results({ game, competition }: { game: Game; competition: Competition }) {
  const matches = useMemo(() => competitionMatches(game, competition.id), [game, competition.id])
  const latest = latestPlayedRound(matches)
  const [chosen, setChosen] = useState<number | null>(null)
  const round = Math.min(competition.roundCount, Math.max(1, chosen ?? latest))
  const list = matches.filter((m) => m.round === round).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl bg-slate-800 p-1">
        <button type="button" className="min-h-11 rounded-lg px-4 text-lg disabled:opacity-30" disabled={round <= 1} onClick={() => setChosen(round - 1)} aria-label="Rodada anterior">
          ‹
        </button>
        <span className="font-semibold">Rodada {round}</span>
        <button type="button" className="min-h-11 rounded-lg px-4 text-lg disabled:opacity-30" disabled={round >= competition.roundCount} onClick={() => setChosen(round + 1)} aria-label="Próxima rodada">
          ›
        </button>
      </div>
      <ul className="divide-y divide-slate-700/60 rounded-xl bg-slate-800">
        {list.map((m) => {
          const home = teamById(game, m.homeTeamId)
          const away = teamById(game, m.awayTeamId)
          const mine = m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId
          return (
            <li key={m.id} className={`px-3 py-2 ${mine ? 'bg-emerald-600/20' : ''}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <span className="truncate text-right">{home.name}</span>
                  <TeamBadge team={home} size="sm" />
                </span>
                <span className="w-14 text-center text-base font-bold tabular-nums">{m.result ? `${m.result.homeGoals} x ${m.result.awayGoals}` : 'x'}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <TeamBadge team={away} size="sm" />
                  <span className="truncate">{away.name}</span>
                </span>
              </div>
              <div className="mt-0.5 text-center text-[11px] text-slate-500">{formatDate(m.date)}</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Classificação da Série A e da B, com zonas de acesso e rebaixamento, e resultados por rodada. */
export function Standings({ game }: { game: Game }) {
  const competitions = game.season.season.competitions
  const mine = competitions.find((c) => c.teamIds.includes(game.userTeamId)) as Competition
  const [competitionId, setCompetitionId] = useState(mine.id)
  const [view, setView] = useState<View>('table')
  const competition = competitions.find((c) => c.id === competitionId) as Competition

  return (
    <div className="space-y-3">
      <Tabs value={competitionId} options={competitions.map((c) => ({ id: c.id, label: TIER_LABELS[c.tier as 1 | 2] ?? c.name }))} onChange={setCompetitionId} />
      <Tabs
        value={view}
        options={[
          { id: 'table' as View, label: 'Classificação' },
          { id: 'results' as View, label: 'Resultados' },
        ]}
        onChange={setView}
      />
      {view === 'table' ? <Table game={game} competition={competition} /> : <Results game={game} competition={competition} />}
    </div>
  )
}
