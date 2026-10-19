import { useMemo, useState } from 'react'
import { cupMatches, cupStatus, groupTables, leaguePhaseTable, stageList, tiesOfStage } from '../../../engine/cups'
import type { TieView } from '../../../engine/cups'
import type { Cup, Match, StandingRow } from '../../../engine/types'
import { cupSeasonLabel, teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { formatDate } from '../../format'
import { Tabs } from '../../components/ui'
import { Panel } from '../../theme'
import { MatchSummary } from './Rounds'
import { SectionHeader, TeamLink, shortName } from './parts'
import { cupScorers, dateRange, defaultCup, scoreText } from './cupData'

type View = 'bracket' | 'games' | 'scorers'

const DECIDED: Record<string, string> = { 'extra-time': 'prorrogação', penalties: 'pênaltis', 'away-goals': 'gol fora', draw: 'sorteio' }

/** O que a copa é para o time do jogador, em uma frase. */
export function cupStatusText(game: Game, cup: Cup): string {
  const s = cupStatus(game.season, cup, game.userTeamId)
  switch (s.state) {
    case 'champion':
      return 'Seu time é o campeão!'
    case 'runner-up':
      return 'Seu time foi o vice-campeão.'
    case 'eliminated':
      return `Seu time foi eliminado: ${s.stageName}.`
    case 'playing':
      return `Seu time está na copa: ${s.stageName}.`
    default:
      return 'Seu time não está nesta copa.'
  }
}

function TieRow({ game, tie, onTeam, onOpen }: { game: Game; tie: TieView; onTeam: (id: string) => void; onOpen: (id: string) => void }) {
  const [a, b] = tie.teams
  const teamA = teamById(game, a)
  const teamB = teamById(game, b)
  const mine = a === game.userTeamId || b === game.userTeamId
  const played = tie.legs.filter((m) => m.status === 'finished')
  const last = tie.legs[tie.legs.length - 1] as Match
  const text = tie.legs.length === 2 ? (played.length === 2 ? `${tie.goals[a]} x ${tie.goals[b]}` : played.length === 1 ? `${scoreText(played[0] as Match)} (ida)` : 'x') : scoreText(last)
  const extra = tie.decidedBy && DECIDED[tie.decidedBy] ? ` · ${DECIDED[tie.decidedBy]}` : ''
  const strong = (id: string) => (tie.winnerId === id ? 'font-extrabold text-white' : tie.winnerId ? 'text-muted' : '')
  return (
    <li className={`flex items-center gap-1.5 border-b border-line/60 px-3 py-2 text-[13px] font-semibold last:border-b-0 ${mine ? 'bg-accent/10' : ''}`}>
      <span className={`flex min-w-0 flex-1 justify-end ${strong(a)}`}>
        <TeamLink team={teamA} onOpen={onTeam} className="flex-row-reverse text-right" />
      </span>
      <button type="button" disabled={played.length === 0} onClick={() => onOpen((played[played.length - 1] as Match).id)} aria-label="Abrir o resumo do último jogo" className="flex min-h-9 min-w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 px-2 text-xs font-extrabold tabular-nums">
        <span>{text}</span>
        {extra && <span className="text-[9px] font-bold uppercase text-amber-300">{extra.slice(3)}</span>}
      </button>
      <span className={`flex min-w-0 flex-1 ${strong(b)}`}>
        <TeamLink team={teamB} onOpen={onTeam} />
      </span>
    </li>
  )
}

function MiniTable({ game, rows, mark, onTeam }: { game: Game; rows: StandingRow[]; mark: number; onTeam: (id: string) => void }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <thead className="text-[10px] uppercase text-muted">
        <tr>
          <th className="py-1 pl-3 text-left">#</th>
          <th className="text-left">Time</th>
          <th>J</th>
          <th>V</th>
          <th>SG</th>
          <th className="pr-3">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.teamId} className={`${r.teamId === game.userTeamId ? 'bg-accent/10' : ''} ${i < mark ? 'border-l-2 border-win' : 'border-l-2 border-transparent'}`}>
            <td className="py-1.5 pl-3 text-left text-muted">{i + 1}</td>
            <td className="max-w-0 text-left">
              <TeamLink team={teamById(game, r.teamId)} onOpen={onTeam} className="font-semibold" />
            </td>
            <td className="text-center">{r.played}</td>
            <td className="text-center">{r.wins}</td>
            <td className="text-center">{r.goalDifference}</td>
            <td className="pr-3 text-center font-extrabold">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Bracket({ game, cup, onTeam, onOpen }: { game: Game; cup: Cup; onTeam: (id: string) => void; onOpen: (id: string) => void }) {
  const matches = cupMatches(game.season.matches, cup.id)
  const stages = stageList(cup.spec)
  const spec = cup.spec
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const log = cup.log[i]
        const inStage = matches.filter((m) => m.cup?.stage === i)
        const days = dateRange(inStage)
        const when = days.length === 0 ? 'a definir' : days.length === 1 ? formatDate(days[0] as string) : `${formatDate(days[0] as string)} a ${formatDate(days[days.length - 1] as string)}`
        return (
          <Panel key={stage.name + i} className="overflow-hidden">
            <div className="flex items-baseline justify-between px-3 pt-3">
              <h3 className="title text-2xl">{stage.name}</h3>
              <span className="text-[11px] text-muted">{when}</span>
            </div>
            {!log ? (
              <p className="px-3 pb-3 pt-1 text-sm text-muted">Os confrontos saem do sorteio quando a fase anterior terminar.</p>
            ) : stage.kind === 'knockout' ? (
              <>
                <ul className="mt-2">
                  {tiesOfStage(matches, spec, i).map((tie) => (
                    <TieRow key={tie.tie} game={game} tie={tie} onTeam={onTeam} onOpen={onOpen} />
                  ))}
                </ul>
                {log.byes.length > 0 && (
                  <p className="px-3 pb-3 pt-2 text-xs text-muted">
                    Passaram direto: {log.byes.map((id) => shortName(teamById(game, id))).join(', ')}.
                  </p>
                )}
              </>
            ) : stage.kind === 'groups' ? (
              <div className="mt-2 grid gap-3 pb-3">
                {groupTables(matches, i).map((g) => (
                  <div key={g.group}>
                    <h4 className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Grupo {String.fromCharCode(64 + g.group)}</h4>
                    <MiniTable game={game} rows={g.rows} mark={spec.groups?.advance ?? 0} onTeam={onTeam} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 pb-3">
                <MiniTable game={game} rows={leaguePhaseTable(matches, i)} mark={(spec.leaguePhase?.direct ?? 0) + (spec.leaguePhase?.playoff ?? 0)} onTeam={onTeam} />
              </div>
            )}
          </Panel>
        )
      })}
    </div>
  )
}

function Games({ game, cup, onTeam, onOpen }: { game: Game; cup: Cup; onTeam: (id: string) => void; onOpen: (id: string) => void }) {
  const matches = cupMatches(game.season.matches, cup.id).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const stages = stageList(cup.spec)
  if (matches.length === 0) return <Panel className="p-4 text-sm text-muted">Nenhum jogo marcado ainda.</Panel>
  return (
    <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
      {matches.map((m) => {
        const mine = m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId
        const finished = m.status === 'finished' && m.result
        return (
          <li key={m.id} className={`border-b border-line/60 px-3 py-2 last:border-b-0 ${mine ? 'bg-accent/10' : ''}`}>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              {formatDate(m.date)} · {stages[m.cup?.stage ?? 0]?.name}
              {m.cup?.kind === 'group' ? ` · Grupo ${String.fromCharCode(64 + (m.cup.group ?? 1))}` : ''}
              {m.cup?.leg ? ` · ${m.cup.leg === 1 ? 'ida' : 'volta'}` : ''}
            </div>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              <span className="flex min-w-0 flex-1 justify-end">
                <TeamLink team={teamById(game, m.homeTeamId)} onOpen={onTeam} className="flex-row-reverse text-right" />
              </span>
              <button type="button" disabled={!finished} onClick={() => onOpen(m.id)} className="min-h-9 min-w-16 shrink-0 rounded-xl bg-surface-2 px-2 text-xs font-extrabold tabular-nums">
                {scoreText(m)}
              </button>
              <span className="flex min-w-0 flex-1">
                <TeamLink team={teamById(game, m.awayTeamId)} onOpen={onTeam} />
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Scorers({ game, cup, onTeam }: { game: Game; cup: Cup; onTeam: (id: string) => void }) {
  const list = useMemo(() => cupScorers(game, cup.id), [game, cup.id])
  if (list.length === 0) return <Panel className="p-4 text-sm text-muted">Ainda não saiu gol nesta copa.</Panel>
  return (
    <ul className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid="cup-scorers">
      {list.map((s, i) => (
        <li key={s.player.id} className={`flex items-center gap-3 border-b border-line/60 px-3 py-2 last:border-b-0 ${s.team.id === game.userTeamId ? 'bg-accent/10' : ''}`}>
          <span className={`w-6 text-center text-sm font-extrabold ${i === 0 ? 'text-amber-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-muted'}`}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{s.player.nickname ?? s.player.name}</div>
            <TeamLink team={s.team} onOpen={onTeam} className="text-[11px] text-muted" />
          </div>
          <div className="text-right">
            <div className="title text-2xl tabular-nums">{s.goals}</div>
            <div className="text-[10px] uppercase text-muted">{s.assists} ass.</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Copas: escolha da copa, chaveamento por fase, todos os jogos e artilharia da copa. */
export function Cups({ game, onTeam }: { game: Game; onTeam: (id: string) => void }) {
  // As copas em que o seu time joga vêm primeiro; depois as do país dele e as outras.
  const cups = useMemo(() => {
    const list = game.season.cups ?? []
    const mine = (c: Cup) => c.entrants.some((e) => e.teamId === game.userTeamId)
    return [...list].sort((a, b) => Number(mine(b)) - Number(mine(a)))
  }, [game.season.cups, game.userTeamId])
  const [cupId, setCupId] = useState(() => defaultCup(game)?.id ?? '')
  const [view, setView] = useState<View>('bracket')
  const [openId, setOpenId] = useState<string | null>(null)
  const cup = cups.find((c) => c.id === cupId) ?? cups[0]
  if (!cup) return <Panel className="p-4 text-sm text-muted">Este mundo não tem copas. Os pacotes de dados podem definir copas e supercopas.</Panel>
  const open = game.season.matches.find((m) => m.id === openId)
  const winner = cup.winnerId ? teamById(game, cup.winnerId) : undefined
  return (
    <div className="space-y-3">
      {cups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cups.map((c) => (
            <button key={c.id} type="button" aria-pressed={c.id === cup.id} onClick={() => setCupId(c.id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${c.id === cup.id ? 'border-amber-300 bg-gradient-to-b from-amber-200 to-amber-400 text-bg' : 'border-line bg-surface text-slate-200'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <SectionHeader icon="trophy" title={cup.name} subtitle={`${cupSeasonLabel(game, cup.id, cup.year)} · ${winner ? `campeão: ${shortName(winner)}` : `${cup.entrants.length} clubes`}`} tone="gold" />
      <p className="text-sm text-muted" data-testid="cup-status">
        {cupStatusText(game, cup)}
      </p>
      <Tabs
        value={view}
        options={[
          { id: 'bracket' as View, label: 'Chaveamento' },
          { id: 'games' as View, label: 'Jogos' },
          { id: 'scorers' as View, label: 'Artilharia' },
        ]}
        onChange={setView}
      />
      {view === 'bracket' && <Bracket game={game} cup={cup} onTeam={onTeam} onOpen={setOpenId} />}
      {view === 'games' && <Games game={game} cup={cup} onTeam={onTeam} onOpen={setOpenId} />}
      {view === 'scorers' && <Scorers game={game} cup={cup} onTeam={onTeam} />}
      {open && open.result && <MatchSummary game={game} match={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
