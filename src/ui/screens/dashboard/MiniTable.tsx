import type { Competition, Match, StandingRow } from '../../../engine/types'
import { standingsOf, teamById, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { outcomeFor } from '../../format'
import { Crest, Icon } from '../../theme'

/** Linhas da mini classificação: o seu time, os dois de cima e os dois de baixo (a janela encosta no topo ou no fim da tabela). */
export function miniWindow<T>(rows: readonly T[], index: number, around = 2): { start: number; rows: T[] } {
  const size = around * 2 + 1
  const start = Math.max(0, Math.min(index - around, rows.length - size))
  return { start, rows: rows.slice(start, start + size) }
}

/** Os cinco primeiros; se o seu time está mais abaixo, ele entra no lugar do quinto (com a posição de verdade). */
export function topFive(rows: readonly StandingRow[], teamId: string): { position: number; row: StandingRow }[] {
  const top = rows.slice(0, 5).map((row, i) => ({ position: i + 1, row }))
  const mine = rows.findIndex((r) => r.teamId === teamId)
  if (mine < 5) return top
  return [...top.slice(0, 4), { position: mine + 1, row: rows[mine] as StandingRow }]
}

const HEAD = 'flex items-center gap-2 border-b border-white/[0.07] bg-gradient-to-r from-accent/[0.10] to-transparent px-3 py-2.5'
const CARD = 'card-bg overflow-hidden rounded-[14px] border border-white/[0.13] border-l-[3px] border-l-accent'

/** Classificação (cinco primeiros) e Últimos resultados do time, lado a lado. */
export function MiniTable({ game, competition, onOpen }: { game: Game; competition: Competition; onOpen: () => void }) {
  const team = userTeam(game)
  const table = standingsOf(game, competition)
  const rows = topFive(table, team.id)
  const matches = game.season.matches.filter((m) => m.competitionId === competition.id || m.cup !== undefined)
  const mine = matches
    .filter((m) => m.status === 'finished' && m.result && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)
    .slice(-5)
    .reverse()
  return (
    <div className="grid grid-cols-2 gap-2.5" data-testid="mini-table">
      <section className={CARD}>
        <div className={HEAD}>
          <Icon name="chart" size={20} className="text-accent" />
          <span className="font-display text-[17px] font-bold leading-none">Classificação</span>
        </div>
        <div className="px-2.5 pb-1 pt-1.5">
          <div className="flex items-center text-[10.5px] text-muted">
            <span className="w-5">Pos</span>
            <span className="flex-1 pl-7">Time</span>
            <span>Pts</span>
          </div>
          <ul>
            {rows.map(({ position, row }) => {
              const t = teamById(game, row.teamId)
              const you = row.teamId === team.id
              return (
                <li key={row.teamId} data-mini-row={row.teamId} className={`-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-[5px] text-[13px] tabular-nums ${you ? 'bg-accent/25 font-bold' : ''}`}>
                  <span className="w-4 text-center font-display text-[15px] font-bold">{position}</span>
                  <Crest team={t} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{t.abbreviation}</span>
                  <span className="font-display text-[15px] font-bold">{row.points}</span>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={onOpen} className="flex min-h-10 w-full items-center justify-end gap-0.5 text-[13px] font-bold text-accent">
            Ver tabela
            <Icon name="chev" size={16} />
          </button>
        </div>
      </section>

      <section className={CARD} data-testid="recent-results">
        <div className={HEAD}>
          <Icon name="shirt" size={20} className="text-white" />
          <span className="font-display text-[17px] font-bold leading-none">Últimos resultados</span>
        </div>
        <ul className="px-2.5 py-1.5">
          {mine.map((m) => {
            const o = outcomeFor(m, team.id)
            const home = teamById(game, m.homeTeamId)
            const away = teamById(game, m.awayTeamId)
            const r = m.result as NonNullable<Match['result']>
            const tone = o === 'W' ? 'text-win' : o === 'L' ? 'text-loss' : 'text-draw'
            return (
              <li key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 py-[5px] text-[11px]">
                <span className="flex min-w-0 items-center gap-1">
                  <Crest team={home} size="xs" />
                  <span className="truncate">{home.abbreviation}</span>
                </span>
                <span className={`font-display text-[15px] font-bold tabular-nums ${tone}`}>
                  {r.homeGoals} - {r.awayGoals}
                </span>
                <span className="flex min-w-0 items-center justify-end gap-1">
                  <span className="truncate">{away.abbreviation}</span>
                  <Crest team={away} size="xs" />
                </span>
              </li>
            )
          })}
          {mine.length === 0 && <li className="py-6 text-center text-xs text-muted">Ainda não há jogos disputados.</li>}
        </ul>
      </section>
    </div>
  )
}
