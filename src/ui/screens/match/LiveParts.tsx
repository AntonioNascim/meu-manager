/**
 * Peças do novo layout da partida ao vivo (redesenho v3): barra do topo (pausa, relógio, escudos e placar, gols), painel de cada time (posse em
 * círculo e números), cartões "Linha do tempo" e "Desempenho" (nota dos times e evolução da partida) e os botões de baixo (Jogos, Dados, Tática).
 * Só mostram o que o motor já gerou: nenhuma conta do jogo passa por aqui.
 */
import type { ReactNode } from 'react'
import type { MatchSnapshot } from '../../../engine/match'
import type { Player, Team, TeamMatchStats } from '../../../engine/types'
import { Crest, Icon } from '../../theme'
import type { IconName } from '../../theme/icons'
import { playerName } from '../../format'
import { shortName } from '../standings/parts'
import { clockText, evolutionOf, goalsOf, teamRatings, timelineOf } from './liveStats'
import type { TimelineKind } from './liveStats'

type TeamLook = Pick<Team, 'id' | 'abbreviation' | 'colors' | 'name'> & { shortName?: string | undefined }
type Named = Pick<Player, 'id' | 'name' | 'nickname'>

const teamName = (t: TeamLook): string => shortName(t as Team)
const crestOf = (t: TeamLook) => ({ abbreviation: t.abbreviation, colors: [...t.colors] as [string, string] })

/** Barra do topo: pausa, relógio e tempo de jogo, escudos e placar, controle de velocidade e a linha de gols. */
export function MatchHeader({
  home,
  away,
  snap,
  label,
  names,
  userTeamId,
  speed,
  effective,
  running,
  onTogglePlay,
  onSpeed,
  onOpponent,
  context,
}: {
  home: TeamLook
  away: TeamLook
  snap: MatchSnapshot
  /** O estado da partida em texto (Antes do apito, 34' · pausado, Intervalo, Fim de jogo...). */
  label: string
  names: ReadonlyMap<string, Named>
  userTeamId: string
  speed: number
  effective?: number | undefined
  running: boolean
  /** Sem ele (liga online: o servidor joga) a barra não tem o botão de pausa. */
  onTogglePlay?: (() => void) | undefined
  onSpeed: () => void
  onOpponent: () => void
  /** Competição e rodada (solo e online). */
  context?: string | undefined
}) {
  const goals = goalsOf(snap)
  const side = (team: TeamLook, reverse: boolean) => {
    const content = (
      <>
        <Crest team={crestOf(team)} size="md" />
        <span className="max-w-full truncate font-display text-[16px] font-bold leading-tight min-[720px]:text-[22px]">{teamName(team)}</span>
      </>
    )
    const cls = `flex min-w-0 flex-1 flex-col items-center gap-1 text-center min-[720px]:items-center min-[720px]:gap-2 ${reverse ? 'min-[720px]:flex-row-reverse' : 'min-[720px]:flex-row'}`
    return team.id === userTeamId ? (
      <div className={cls}>{content}</div>
    ) : (
      <button type="button" onClick={onOpponent} aria-label={`Ver a tática de ${team.name}`} data-testid="opponent-crest" className={`${cls} rounded-lg active:bg-white/5`}>
        {content}
      </button>
    )
  }
  const goalText = (g: ReturnType<typeof goalsOf>[number]) => {
    const who = names.get(g.playerId)
    return `${who ? playerName(who) : ''} ${g.minute}'${g.own ? ' (contra)' : ''}`
  }
  return (
    <div className="card-bg relative overflow-hidden rounded-[14px] border border-accent/45 p-2.5 shadow-[inset_0_0_30px_rgb(39_224_90/0.07),0_0_18px_rgb(39_224_90/0.12)] min-[720px]:p-3" data-testid="match-header">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 min-[720px]:flex-nowrap min-[720px]:gap-4">
        {onTogglePlay ? (
          <button type="button" onClick={onTogglePlay} aria-label={running ? 'Pausar' : 'Continuar'} data-testid="play-toggle" className="order-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-accent/70 bg-bg/60 text-accent active:scale-95">
            <Icon name={running ? 'pause' : 'play'} size={22} />
          </button>
        ) : (
          <span className="order-1 h-11 w-2 shrink-0" aria-hidden="true" />
        )}
        <div className="order-2 min-w-0 flex-1 text-center min-[720px]:w-24 min-[720px]:flex-none" data-testid="match-clock">
          <div className="font-display text-[32px] font-extrabold leading-none tabular-nums min-[720px]:text-[38px]">{clockText(snap.minute)}</div>
          <div className="mt-0.5 font-display text-[13px] font-bold leading-tight text-accent min-[720px]:text-[14px]">{label}</div>
        </div>
        <div className="order-4 flex w-full min-w-0 items-center justify-between gap-1 min-[720px]:order-3 min-[720px]:w-auto min-[720px]:flex-1 min-[720px]:gap-3">
          {side(home, false)}
          <div className="shrink-0 text-center">
            <div className="font-display text-[36px] font-extrabold leading-none tabular-nums min-[720px]:text-[46px]" data-testid="score">
              {snap.homeGoals} <span className="text-muted">-</span> {snap.awayGoals}
            </div>
            {snap.penalties && snap.finished && <div className="text-xs font-bold tabular-nums text-amber-300">({snap.penalties.home} x {snap.penalties.away} nos pênaltis)</div>}
          </div>
          {side(away, true)}
        </div>
        <button type="button" onClick={onSpeed} aria-label={`Velocidade ${speed}x. Toque para mudar`} data-testid="speed" className="order-3 min-h-11 min-w-[54px] shrink-0 min-[720px]:order-4 rounded-[10px] border-[1.5px] border-accent px-2 font-display text-lg font-extrabold tabular-nums text-accent active:scale-95">
          {speed}x
          {effective !== undefined && effective !== speed && (
            <span className="block text-[9px] font-bold leading-none text-amber" data-testid="speed-effective">
              valendo {effective}x
            </span>
          )}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1a2528]">
        <div className="h-full bg-gradient-to-r from-[#17b845] to-[#4bf27a] transition-all" style={{ width: `${(snap.minute / (snap.extraTime ? 120 : 90)) * 100}%` }} />
      </div>
      {(goals.length > 0 || context) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[12.5px] font-semibold text-slate-200" data-testid="goal-line">
          {context && <span className="text-cyan">{context}</span>}
          {goals.map((g) => (
            <span key={g.index} className="inline-flex items-center gap-1">
              <Icon name="ball" size={13} className="text-white" />
              {goalText(g)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Posse de bola em círculo (a parte do time na cor dele). */
function PossessionDonut({ value, color }: { value: number; color: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const share = Math.max(0, Math.min(100, value))
  return (
    <div className="relative mx-auto h-[88px] w-[88px] min-[720px]:h-[100px] min-[720px]:w-[100px]" role="img" aria-label={`Posse de bola ${Math.round(share)}%`}>
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="9" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(share / 100) * c} ${c}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-[24px] font-extrabold tabular-nums" data-testid="possession">
        {Math.round(share)}%
      </span>
    </div>
  )
}

function StatRow({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-t border-white/[0.07] px-2 py-1.5 text-[12px]">
      <Icon name={icon} size={15} className="shrink-0 text-slate-300" />
      <span className="min-w-0 flex-1 truncate text-slate-300">{label}</span>
      <b className="font-display text-[16px] leading-none tabular-nums">{value}</b>
    </div>
  )
}

/** Painel de um time: escudo, posse de bola em círculo e finalizações, no alvo, escanteios, faltas e cartões. */
export function TeamPanel({ team, stats, color, side }: { team: TeamLook; stats: TeamMatchStats; color: string; side: 'home' | 'away' }) {
  return (
    <section className="card-bg overflow-hidden rounded-[14px] border border-white/[0.13]" aria-label={`Números de ${team.name}`} data-testid={`team-panel-${side}`}>
      <div className="flex flex-col items-center gap-1 px-2 pb-2 pt-2.5">
        <Crest team={crestOf(team)} size="md" />
        <span className="max-w-full truncate font-display text-[16px] font-bold leading-tight">{teamName(team)}</span>
      </div>
      <div className="px-2 pb-2">
        <div className="mb-1 text-center text-[12px] font-semibold text-slate-300">Posse de bola</div>
        <PossessionDonut value={stats.possession} color={color} />
      </div>
      <StatRow icon="ball" label="Finalizações" value={stats.shots} />
      <StatRow icon="target" label="No alvo" value={stats.shotsOnTarget} />
      <StatRow icon="flag" label="Escanteios" value={stats.corners} />
      <StatRow icon="whistle" label="Faltas" value={stats.fouls} />
      <StatRow
        icon="card"
        label="Cartões"
        value={
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-0.5">
              <i className="inline-block h-3 w-2 rounded-[1.5px] bg-yellow-300" aria-hidden="true" />
              {stats.yellowCards}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <i className="inline-block h-3 w-2 rounded-[1.5px] bg-red-600" aria-hidden="true" />
              {stats.redCards}
            </span>
          </span>
        }
      />
    </section>
  )
}

const TIMELINE_ICON: Record<TimelineKind, ReactNode> = {
  goal: <Icon name="ball" size={20} className="text-white" />,
  'own-goal': <Icon name="ball" size={20} className="text-loss" />,
  yellow: <i className="inline-block h-5 w-3.5 rounded-[2px] bg-yellow-300" aria-label="Cartão amarelo" />,
  red: <i className="inline-block h-5 w-3.5 rounded-[2px] bg-red-600" aria-label="Cartão vermelho" />,
  sub: <Icon name="swap" size={20} className="text-accent" />,
  'penalty-missed': <Icon name="x" size={20} className="text-loss" />,
}

export function CardShell({ title, icon, children, testId }: { title: string; icon: IconName; children: ReactNode; testId?: string }) {
  return (
    <section className="card-bg overflow-hidden rounded-[14px] border border-white/[0.13]" aria-label={title} {...(testId ? { 'data-testid': testId } : {})}>
      <h2 className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5 font-display text-[17px] font-bold">
        <Icon name={icon} size={19} className="text-accent" />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** "Linha do tempo": gols, cartões e substituições, do mais recente ao mais antigo, com o time entre parênteses. */
export function TimelineCard({ snap, teams, names }: { snap: MatchSnapshot; teams: ReadonlyMap<string, TeamLook>; names: ReadonlyMap<string, Named> }) {
  const entries = timelineOf(snap, 12)
  const nameOf = (id: string | undefined) => {
    const p = id ? names.get(id) : undefined
    return p ? playerName(p) : ''
  }
  return (
    <CardShell title="Linha do tempo" icon="clock" testId="timeline-card">
      {entries.length === 0 ? (
        <p className="p-3 text-sm text-muted">Ainda não saiu gol, cartão nem substituição.</p>
      ) : (
        <ol className="relative max-h-[15.5rem] overflow-y-auto px-3 py-2">
          {entries.map((e) => (
            <li key={e.index} className="relative flex items-center gap-2.5 py-1.5 pl-5">
              <span className="absolute left-[3px] top-0 h-full w-px bg-accent/50" aria-hidden="true" />
              <span className="absolute left-0 top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_6px_var(--color-accent)]" aria-hidden="true" />
              <span className="w-9 shrink-0 font-display text-[17px] font-bold tabular-nums">{e.minute}'</span>
              <span className="flex w-6 shrink-0 justify-center">{TIMELINE_ICON[e.kind]}</span>
              <span className="min-w-0 text-[12.5px] leading-tight">
                <b className="block truncate">{nameOf(e.kind === 'sub' ? e.relatedId : e.playerId)}</b>
                <span className="block truncate text-muted">({teams.get(e.teamId)?.shortName ?? teams.get(e.teamId)?.name ?? ''})</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  )
}

/** Gráfico da evolução da partida: uma linha por time, de 0 a 100, ao longo dos minutos. */
function EvolutionChart({ snap, homeColor, awayColor }: { snap: MatchSnapshot; homeColor: string; awayColor: string }) {
  const points = evolutionOf(snap)
  const end = Math.max(90, snap.minute)
  const x = (m: number) => 22 + (m / end) * 168
  const y = (v: number) => 6 + (1 - v / 100) * 66
  const path = (key: 'home' | 'away') => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minute).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  return (
    <svg viewBox="0 0 200 84" className="h-auto w-full" role="img" aria-label="Evolução da partida" data-testid="evolution-chart">
      <g stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" fontSize="6.5" fill="rgba(255,255,255,0.6)">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1="22" x2="192" y1={y(v)} y2={y(v)} />
            <text x="18" y={y(v) + 2.2} textAnchor="end" stroke="none">
              {v}
            </text>
          </g>
        ))}
      </g>
      <path d={path('away')} fill="none" stroke={awayColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path('home')} fill="none" stroke={homeColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={x(last.minute)} cy={y(Math.max(last.home, last.away))} r="2.2" fill="#fff" />}
    </svg>
  )
}

/** "Desempenho": a nota de cada time (0 a 10) e a evolução da partida. */
export function PerformanceCard({ snap, home, away, homeColor, awayColor }: { snap: MatchSnapshot; home: TeamLook; away: TeamLook; homeColor: string; awayColor: string }) {
  const ratings = teamRatings(snap)
  const row = (team: TeamLook, value: number, color: string) => (
    <div>
      <div className="flex items-end justify-between">
        <span className="truncate text-[13px] font-semibold">{teamName(team)}</span>
        <b className="font-display text-[22px] leading-none tabular-nums" data-testid={`rating-${team.id}`}>
          {value.toFixed(1)}
        </b>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${value * 10}%`, background: color }} />
      </div>
    </div>
  )
  return (
    <CardShell title="Desempenho" icon="users" testId="performance-card">
      <div className="space-y-2.5 px-3 pt-3">
        {row(home, ratings.home, homeColor)}
        {row(away, ratings.away, awayColor)}
      </div>
      <div className="mt-2 border-t border-white/[0.07] px-3 pb-3 pt-2">
        <div className="mb-1 text-[13px] font-bold">Evolução da partida</div>
        <EvolutionChart snap={snap} homeColor={homeColor} awayColor={awayColor} />
      </div>
    </CardShell>
  )
}

/** Os botões de baixo (Jogos, Dados, Tática): tocar abre o painel embaixo; tocar de novo fecha. */
export function LiveTabs<T extends string>({ value, options, onChange }: { value: T | null; options: { id: T; label: string; icon: IconName }[]; onChange: (id: T | null) => void }) {
  return (
    <nav className="card-bg grid grid-flow-col auto-cols-fr overflow-hidden rounded-[14px] border border-white/[0.13]" aria-label="Painéis da partida" data-testid="live-tabs">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : o.id)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-r border-white/[0.07] text-[12.5px] last:border-r-0 ${on ? 'bg-accent/[0.12] font-bold text-accent' : 'font-semibold text-slate-200'}`}
          >
            <Icon name={o.icon} size={22} />
            {o.label}
          </button>
        )
      })}
    </nav>
  )
}
