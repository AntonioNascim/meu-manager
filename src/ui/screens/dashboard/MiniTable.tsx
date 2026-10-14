import type { Competition, Match } from '../../../engine/types'
import { standingsOf, teamById, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { outcomeFor } from '../../format'
import { Crest, Eyebrow, Panel, ResultDot } from '../../theme'
import { teamForm } from '../standings/data'

/** Linhas da mini classificação: o seu time, os dois de cima e os dois de baixo (a janela encosta no topo ou no fim da tabela). */
export function miniWindow<T>(rows: readonly T[], index: number, around = 2): { start: number; rows: T[] } {
  const size = around * 2 + 1
  const start = Math.max(0, Math.min(index - around, rows.length - size))
  return { start, rows: rows.slice(start, start + size) }
}

export function MiniTable({ game, competition, onOpen }: { game: Game; competition: Competition; onOpen: () => void }) {
  const team = userTeam(game)
  const table = standingsOf(game, competition)
  const index = Math.max(0, table.findIndex((r) => r.teamId === team.id))
  const { start, rows } = miniWindow(table, index)
  const matches = game.season.matches.filter((m) => m.competitionId === competition.id)
  const mine = matches
    .filter((m) => m.status === 'finished' && m.result && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
    .slice(-5)
  return (
    <Panel className="p-4" data-testid="mini-table">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>Classificação</Eyebrow>
        <button type="button" onClick={onOpen} className="min-h-10 text-sm font-bold text-accent">
          Ver tabela
        </button>
      </div>
      <table className="mt-1 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted">
            <th className="w-7 text-left font-bold">#</th>
            <th className="text-left font-bold">Time</th>
            <th className="w-7 font-bold">J</th>
            <th className="w-9 font-bold">SG</th>
            <th className="w-9 font-bold">Pts</th>
            <th className="w-[4.2rem] text-right font-bold">Forma</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = teamById(game, r.teamId)
            const you = r.teamId === team.id
            const form = teamForm(matches, r.teamId, 5)
            return (
              <tr key={r.teamId} className={you ? 'bg-accent/10 font-bold text-accent' : ''} data-mini-row={r.teamId}>
                <td className="py-1.5 pl-1 text-left">{start + i + 1}</td>
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <Crest team={t} size="xs" />
                    <span className="truncate">{t.abbreviation}</span>
                  </span>
                </td>
                <td className="text-center">{r.played}</td>
                <td className="text-center">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                <td className="text-center">{r.points}</td>
                <td className="pr-1">
                  <span className="flex justify-end gap-0.5">
                    {form.map((o, k) => (
                      <span key={k} className={`h-2.5 w-2.5 rounded-full ${o === 'W' ? 'bg-win' : o === 'D' ? 'bg-draw' : 'bg-loss'}`} />
                    ))}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {mine.length > 0 && (
        <div className="mt-3 border-t border-line pt-3" data-testid="recent-results">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Seus últimos jogos</div>
          <ul className="flex flex-wrap gap-2">
            {mine.map((m) => {
              const o = outcomeFor(m, team.id)
              const home = m.homeTeamId === team.id
              const rival = teamById(game, home ? m.awayTeamId : m.homeTeamId)
              const r = m.result as NonNullable<Match['result']>
              return (
                <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 text-xs font-bold tabular-nums">
                  {o && <ResultDot outcome={o} />}
                  <span>
                    {home ? r.homeGoals : r.awayGoals}–{home ? r.awayGoals : r.homeGoals}
                  </span>
                  <span className="text-muted">
                    {home ? 'x' : '@'} {rival.abbreviation}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Panel>
  )
}
