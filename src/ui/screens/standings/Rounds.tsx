import { useMemo, useState } from 'react'
import type { Competition, Match, MatchEvent } from '../../../engine/types'
import { competitionMatches, teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { formatDate, playerName } from '../../format'
import { Icon, Sheet } from '../../theme'
import { SectionHeader, TeamLink } from './parts'

/** Rodada mostrada ao abrir: a primeira que ainda tem jogo por disputar (a última, se a temporada acabou). */
export function currentRound(matches: readonly Match[], roundCount: number): number {
  const open = matches.filter((m) => m.status === 'scheduled').map((m) => m.round)
  return open.length > 0 ? Math.min(...open) : roundCount
}

/** Resumo de um jogo disputado: placar, gols com assistência e cartões (quando a partida guardou os lances). */
export function MatchSummary({ game, match, onClose }: { game: Game; match: Match; onClose: () => void }) {
  const home = teamById(game, match.homeTeamId)
  const away = teamById(game, match.awayTeamId)
  const result = match.result as NonNullable<Match['result']>
  const players = new Map(game.season.players.map((p) => [p.id, p]))
  const name = (id: string) => {
    const p = players.get(id)
    return p ? playerName(p) : 'Jogador'
  }
  const events = result.events.filter((e) => e.type === 'goal' || e.type === 'own-goal' || e.type === 'yellow-card' || e.type === 'red-card').sort((a, b) => a.minute - b.minute)
  const line = (e: MatchEvent) => {
    const side = e.teamId === match.homeTeamId ? 'justify-start' : 'justify-end text-right'
    const icon = e.type === 'yellow-card' ? <span className="inline-block h-4 w-3 rounded-[2px] bg-yellow-300" /> : e.type === 'red-card' ? <span className="inline-block h-4 w-3 rounded-[2px] bg-loss" /> : <Icon name="ball" size={16} />
    const label = e.type === 'own-goal' ? `${name(e.playerId)} (contra)` : name(e.playerId)
    return (
      <li key={`${e.minute}-${e.type}-${e.playerId}`} className={`flex items-center gap-2 py-2 text-sm ${side}`}>
        {e.teamId === match.homeTeamId && <span className="w-9 shrink-0 text-xs font-bold tabular-nums text-muted">{e.minute}'</span>}
        {icon}
        <span className="min-w-0">
          <span className="block truncate font-bold">{label}</span>
          {e.type === 'goal' && e.relatedPlayerId && (
            <span className="block truncate text-[11px] text-muted">
              assist.: {name(e.relatedPlayerId)}
              {e.assistKind === 'cross' ? ' (cruzamento)' : e.assistKind === 'pass' ? ' (passe)' : ''}
            </span>
          )}
        </span>
        {e.teamId !== match.homeTeamId && <span className="w-9 shrink-0 text-xs font-bold tabular-nums text-muted">{e.minute}'</span>}
      </li>
    )
  }
  const goals = result.homeGoals + result.awayGoals
  return (
    <Sheet title="Resumo do jogo" onClose={onClose}>
      <div className="flex items-center justify-between gap-2 py-2">
        <TeamLink team={home} size="sm" className="flex-1 flex-col !items-center text-center text-sm font-bold" />
        <span className="title text-5xl tabular-nums">
          {result.homeGoals} x {result.awayGoals}
        </span>
        <TeamLink team={away} size="sm" className="flex-1 flex-col !items-center text-center text-sm font-bold" />
      </div>
      {(result.penalties || result.extraTime) && (
        <p className="text-center text-xs font-bold text-amber-300">
          {result.penalties ? `Pênaltis: ${result.penalties.home} x ${result.penalties.away} (depois da prorrogação)` : 'Decidido na prorrogação'}
        </p>
      )}
      <p className="text-center text-xs text-muted">
        {formatDate(match.date)} · {match.cup?.neutral ? 'campo neutro' : home.stadium.name}
        {match.attendance ? ` · ${match.attendance.toLocaleString('pt-BR')} pagantes` : ''}
      </p>
      {events.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">{events.map(line)}</ul>
      ) : (
        <p className="mt-4 text-sm text-muted">{goals > 0 ? 'Os lances desta partida não foram guardados.' : 'Sem gols e sem cartões.'}</p>
      )}
    </Sheet>
  )
}

/** Rodadas: título "Rodada N" com setas, data e cada jogo com escudos, placar (ou x) e estádio; o seu jogo em destaque. */
export function Rounds({ game, competition, onTeam }: { game: Game; competition: Competition; onTeam: (id: string) => void }) {
  const matches = useMemo(() => competitionMatches(game, competition.id), [game, competition.id])
  const [chosen, setChosen] = useState<number | null>(null)
  const [openId, setOpenId] = useState<string | null>(() => (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('resumo') !== null ? (matches.find((m) => m.status === 'finished' && m.result && m.result.homeGoals + m.result.awayGoals >= 2)?.id ?? null) : null))
  const round = Math.min(competition.roundCount, Math.max(1, chosen ?? currentRound(matches, competition.roundCount)))
  const list = matches.filter((m) => m.round === round).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const date = list[0]?.date
  const played = list.filter((m) => m.status === 'finished').length
  const open = matches.find((m) => m.id === openId)

  return (
    <div className="space-y-3">
      <SectionHeader icon="calendar" title="Rodadas" subtitle={`${competition.name} · temporada ${game.season.season.year}`} tone="violet" />
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface p-2">
        <button type="button" className="min-h-12 min-w-12 rounded-xl border border-line bg-surface-2 text-xl font-bold disabled:opacity-30" disabled={round <= 1} onClick={() => setChosen(round - 1)} aria-label="Rodada anterior">
          ‹
        </button>
        <div className="text-center">
          <div className="title text-3xl">Rodada {round}</div>
          <div className="text-xs text-muted">
            {date ? formatDate(date) : ''} · toque no placar para o resumo · {played === list.length && list.length > 0 ? 'encerrada' : played > 0 ? `${played} de ${list.length} jogos` : 'a jogar'}
          </div>
        </div>
        <button type="button" className="min-h-12 min-w-12 rounded-xl border border-line bg-surface-2 text-xl font-bold disabled:opacity-30" disabled={round >= competition.roundCount} onClick={() => setChosen(round + 1)} aria-label="Próxima rodada">
          ›
        </button>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {list.map((m) => {
          const home = teamById(game, m.homeTeamId)
          const away = teamById(game, m.awayTeamId)
          const mine = m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId
          const finished = m.status === 'finished' && m.result
          const score = (
            <span className={`flex h-9 w-14 shrink-0 items-center justify-center rounded-xl text-base font-extrabold tabular-nums ${finished ? 'bg-surface-2' : 'bg-surface-2 text-muted'}`}>
              {finished ? `${m.result?.homeGoals} x ${m.result?.awayGoals}` : 'x'}
            </span>
          )
          return (
            <li key={m.id} className={`border-b border-line/60 last:border-b-0 ${mine ? 'bg-accent/10' : ''}`}>
              <div className="flex items-center gap-1.5 px-3 pt-3 text-[13px] font-semibold">
                <span className="flex min-w-0 flex-1 justify-end">
                  <TeamLink team={home} onOpen={onTeam} className="flex-row-reverse text-right" />
                </span>
                {finished ? (
                  <button type="button" onClick={() => setOpenId(m.id)} aria-label="Abrir o resumo do jogo">
                    {score}
                  </button>
                ) : (
                  score
                )}
                <span className="flex min-w-0 flex-1">
                  <TeamLink team={away} onOpen={onTeam} />
                </span>
              </div>
              <div className="flex items-center justify-center gap-1.5 px-3 pb-3 pt-1 text-[11px] text-muted">
                <Icon name="stadium" size={13} />
                {home.stadium.name} · {m.date.split('-').reverse().slice(0, 2).join('/')}
              </div>
            </li>
          )
        })}
      </ul>
      {open && open.result && <MatchSummary game={game} match={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
