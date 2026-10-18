import { useMemo, useState } from 'react'
import type { Competition } from '../../../engine/types'
import { seasonLabelOf, teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { ZONE_LABELS } from '../../labels'
import type { Zone } from '../../labels'
import { Icon } from '../../theme'
import { seasonYears, standingsFor, teamForm } from './data'
import { FormDots, SectionHeader, TeamLink } from './parts'

/** Zona de uma posição (1 a N): acesso no topo da Série B, rebaixamento no fim da Série A. */
export function zoneOf(position: number, size: number, competition: Pick<Competition, 'promotionSlots' | 'relegationSlots'>): Zone | null {
  if (position <= competition.promotionSlots) return 'promotion'
  if (position > size - competition.relegationSlots) return 'relegation'
  return null
}

/** Só as zonas que existem: campeão e rebaixamento na Série A, acesso na Série B. */
type Band = Zone | 'champion'

const BAND_BAR: Record<Band, string> = { champion: 'bg-amber-400', promotion: 'bg-win', relegation: 'bg-loss' }
const BAND_LABEL: Record<Band, string> = { champion: 'Campeão', promotion: ZONE_LABELS.promotion, relegation: ZONE_LABELS.relegation }

/** Última rodada com algum jogo disputado (a rodada "atual" para mostrar os resultados). */
export function latestPlayedRound(matches: readonly { status: string; round: number }[]): number {
  return matches.reduce((round, m) => (m.status === 'finished' ? Math.max(round, m.round) : round), 1)
}

const cols = ['J', 'V', 'E', 'D', 'GP', 'GC', 'SG'] as const

/** Classificação da temporada atual ou de uma passada (seta no topo), com faixa de zona, bolinhas dos últimos 5 jogos e o seu time em destaque. */
export function Table({ game, competition, onTeam }: { game: Game; competition: Competition; onTeam: (id: string) => void }) {
  const years = seasonYears(game, competition)
  const [year, setYear] = useState(years[years.length - 1] as number)
  const index = years.indexOf(year)
  const current = year === years[years.length - 1]
  const rows = useMemo(() => standingsFor(game, competition, year), [game, competition, year])
  const matches = useMemo(() => game.season.matches.filter((m) => m.competitionId === competition.id), [game.season.matches, competition.id])
  const started = rows.some((r) => r.played > 0)
  const used = new Set<Band>()
  const bandOf = (position: number): Band | null => {
    if (competition.tier === 1 && position === 1 && started) return 'champion'
    return started ? zoneOf(position, rows.length, competition) : null
  }

  return (
    <div className="space-y-3">
      <SectionHeader icon="trophy" title="Campeonato" subtitle={`${competition.name} · temporada ${seasonLabelOf(game, competition.pyramid ?? 'default', year)}`} tone="gold" />
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-1">
        <button type="button" className="min-h-11 min-w-12 rounded-xl text-xl font-bold disabled:opacity-30" disabled={index <= 0} onClick={() => setYear(years[index - 1] as number)} aria-label="Temporada anterior">
          ‹
        </button>
        <span className="flex items-center gap-2 font-extrabold tabular-nums">
          <Icon name="calendar" size={18} /> {year}
        </span>
        <button type="button" className="min-h-11 min-w-12 rounded-xl text-xl font-bold disabled:opacity-30" disabled={index >= years.length - 1} onClick={() => setYear(years[index + 1] as number)} aria-label="Próxima temporada">
          ›
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <div className="text-[12px]">
          <div className="flex items-center border-b border-line px-1 py-2 text-[11px] font-bold uppercase text-muted">
            <span className="sticky left-0 z-10 flex w-[128px] shrink-0 bg-surface pl-2">
              <span className="w-5">#</span>Clube
            </span>
            {cols.map((h) => (
              <span key={h} className={`${h === 'SG' ? 'w-6' : h === 'GP' || h === 'GC' ? 'w-[22px] max-[419px]:hidden' : 'w-[18px]'} shrink-0 text-center`}>
                {h}
              </span>
            ))}
            <span className="w-[26px] shrink-0 text-center">Pts</span>
            {current && <span className="w-[56px] shrink-0 text-center">Últ. 5</span>}
          </div>
          <ul>
            {rows.map((row, i) => {
              const team = teamById(game, row.teamId)
              const band = bandOf(i + 1)
              if (band) used.add(band)
              const mine = row.teamId === game.userTeamId
              const bg = mine ? 'bg-accent/10' : 'bg-surface'
              return (
                <li key={row.teamId} aria-label={band ? BAND_LABEL[band] : undefined} className={`flex min-h-11 items-center border-b border-line/60 px-1 text-sm last:border-b-0 ${mine ? 'bg-accent/10 font-bold' : ''}`}>
                  <span className={`sticky left-0 z-10 flex w-[128px] shrink-0 items-center ${bg}`}>
                    <span className={`mr-1 h-9 w-1 shrink-0 rounded-full ${band ? BAND_BAR[band] : 'bg-transparent'}`} />
                    <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-muted">{started ? i + 1 : '–'}</span>
                    <TeamLink team={team} onOpen={onTeam} className="flex-1 gap-1.5 pr-1" />
                  </span>
                  {[row.played, row.wins, row.draws, row.losses, row.goalsFor, row.goalsAgainst].map((v, k) => (
                    <span key={k} className={`${k >= 4 ? 'w-[22px] max-[419px]:hidden' : 'w-[18px]'} shrink-0 text-center tabular-nums text-slate-300`}>
                      {v}
                    </span>
                  ))}
                  <span className="w-6 shrink-0 text-center tabular-nums text-slate-300">{row.goalDifference}</span>
                  <span className="w-[26px] shrink-0 text-center font-extrabold tabular-nums">{row.points}</span>
                  {current && (
                    <span className="flex w-[56px] shrink-0 justify-center">
                      <FormDots form={teamForm(matches, row.teamId)} />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {(['champion', 'promotion', 'relegation'] as Band[])
          .filter((b) => used.has(b))
          .map((b) => (
            <span key={b} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${BAND_BAR[b]}`} />
              {BAND_LABEL[b]}
              {b === 'promotion' ? ` (${competition.promotionSlots} primeiros)` : b === 'relegation' ? ` (${competition.relegationSlots} últimos)` : ''}
            </span>
          ))}
      </div>
      <p className="text-[11px] text-muted">Em telas pequenas a tabela esconde GP e GC (gols pró e contra). Desempate: pontos, vitórias, saldo, gols pró, confronto direto, cartões. Toque num time para estudá-lo.</p>
    </div>
  )
}
