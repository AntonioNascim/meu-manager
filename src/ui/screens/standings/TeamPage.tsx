import { POSITIONS } from '../../../engine/types'
import type { Match, StandingRow } from '../../../engine/types'
import { competitionMatches, squadOf, standingsOf, teamById, teamStrength } from '../../../store/game'
import type { Game } from '../../../store/game'
import { formatDate, playerName } from '../../format'
import { POSITION_SHORT_LABELS, TIER_LABELS } from '../../labels'
import { playerOverall } from '../../../engine/overall'
import { shortName } from './parts'
import { Crest, Eyebrow, Flag, Panel, ResultDot, ValueBadge } from '../../theme'

/** Página simples de um time para estudar o adversário: posição, força, últimos resultados e elenco. */
export function TeamPage({ game, teamId, onBack, onTeam }: { game: Game; teamId: string; onBack: () => void; onTeam: (id: string) => void }) {
  const team = teamById(game, teamId)
  const competition = game.season.season.competitions.find((c) => c.teamIds.includes(teamId))
  const rows: StandingRow[] = competition ? standingsOf(game, competition) : []
  const index = rows.findIndex((r) => r.teamId === teamId)
  const row = rows[index]
  const matches = competition ? competitionMatches(game, competition.id).filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId) : []
  const finished = matches.filter((m) => m.status === 'finished' && m.result).sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round).slice(0, 5)
  const next = matches.filter((m) => m.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date) || a.round - b.round)[0]
  const squad = [...squadOf(game, teamId)].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || playerOverall(b) - playerOverall(a))
  const mine = teamId === game.userTeamId

  const opponentLine = (m: Match) => {
    const home = m.homeTeamId === teamId
    const other = teamById(game, home ? m.awayTeamId : m.homeTeamId)
    return { home, other }
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-line bg-surface px-4 font-bold">
        ‹ Voltar
      </button>
      <Panel striped cut className="flex items-center gap-4 p-4">
        <Crest team={team} size="xl" />
        <div className="min-w-0">
          <h2 className="title text-4xl">{team.name}</h2>
          <p className="text-xs text-muted">
            {competition ? (TIER_LABELS[competition.tier as 1 | 2] ?? competition.name) : ''} · {team.city}/{team.state}
          </p>
          <p className="text-xs text-muted">{team.stadium.name}</p>
          {mine && <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">Seu time</span>}
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Posição', row && row.played > 0 ? `${index + 1}º` : '–'],
          ['Pontos', row ? String(row.points) : '–'],
          ['Força', teamStrength(game, team).toFixed(1)],
        ].map(([label, value]) => (
          <Panel key={label} className="p-3">
            <div className="title text-3xl">{value}</div>
            <div className="text-[11px] text-muted">{label}</div>
          </Panel>
        ))}
      </div>

      <Panel className="p-4">
        <Eyebrow>Últimos resultados</Eyebrow>
        {finished.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Ainda não jogou nesta temporada.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {finished.map((m) => {
              const { home, other } = opponentLine(m)
              const r = m.result as NonNullable<Match['result']>
              const mineGoals = home ? r.homeGoals : r.awayGoals
              const theirs = home ? r.awayGoals : r.homeGoals
              const outcome = mineGoals > theirs ? 'W' : mineGoals === theirs ? 'D' : 'L'
              return (
                <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                  <ResultDot outcome={outcome} />
                  <button type="button" onClick={() => onTeam(other.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Abrir ${other.name}`}>
                    <Crest team={other} size="xs" />
                    <span className="truncate font-semibold">{shortName(other)}</span>
                  </button>
                  <span className="shrink-0 text-xs text-muted">{home ? 'em casa' : 'fora'}</span>
                  <span className="w-12 shrink-0 text-right font-extrabold tabular-nums">
                    {mineGoals} x {theirs}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {next && (
          <p className="mt-3 text-xs text-muted">
            Próximo jogo: {opponentLine(next).home ? 'em casa contra' : 'fora contra'} <b className="text-slate-200">{shortName(opponentLine(next).other)}</b>, {formatDate(next.date)} (rodada {next.round}).
          </p>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <div className="px-4 pt-4">
          <Eyebrow>Elenco · {squad.length} jogadores</Eyebrow>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {squad.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[p.position]}</span>
              <Flag nationality={p.nationality} />
              <span className="min-w-0 flex-1 truncate font-semibold">{playerName(p)}</span>
              <span className="shrink-0 text-xs text-muted">{p.age} anos</span>
              <ValueBadge value={playerOverall(p)}>{Math.round(playerOverall(p))}</ValueBadge>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
