import { useRef } from 'react'
import { formationOf } from '../../../engine/formations'
import { marketValue } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import type { Player, Team } from '../../../engine/types'
import { squadOf, teamStrength, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { formatCompactMoney, playerName } from '../../format'
import { POSITION_SHORT_LABELS, formationLabel } from '../../labels'
import { gridCoords } from '../../pitchLayout'
import { isUnavailable } from '../../squadSort'
import { assignNumber } from '../match/pitchModel'
import { seedNumbers } from '../../shirt'
import { MiniFormation } from '../dashboard/MiniFormation'
import { Avatar, FitName, Icon, StadiumArt } from '../../theme'

/** Estrelas do time (de meia em meia), pela força média dos titulares. */
export function teamStars(strength: number): number {
  return Math.round(Math.max(0.5, Math.min(5, (strength - 35) / 10)) * 2) / 2
}

function HalfStars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = value >= i + 1 ? 1 : value >= i + 0.5 ? 0.5 : 0
        return (
          <svg key={i} width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={`hs-${i}-${fill}`}>
                <stop offset={`${fill * 100}%`} stopColor="#f2c94c" />
                <stop offset={`${fill * 100}%`} stopColor="transparent" />
              </linearGradient>
            </defs>
            <path d="m12 2.5 2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.4 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9L12 2.5Z" fill={`url(#hs-${i}-${fill})`} stroke="#f2c94c" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )
      })}
    </span>
  )
}

/** Frase curta do elenco, pela força dele em relação aos outros times da mesma liga. */
export function squadTagline(game: Game, team: Team): string {
  const mates = game.season.teams.filter((t) => t.country === team.country && t.id !== team.id)
  const mine = teamStrength(game, team)
  const stronger = mates.filter((t) => teamStrength(game, t) > mine).length
  const share = stronger / Math.max(1, mates.length)
  if (share <= 0.2) return 'Elenco forte para brigar por todos os títulos!'
  if (share <= 0.6) return 'Elenco equilibrado: dá para sonhar alto.'
  return 'Elenco em formação: aposte na base e no mercado.'
}

/** Posição na tela: o fundo do campo fica mais largo que o topo (perspectiva). */
const squeeze = (y: number) => 0.8 + 0.2 * (y / 100)
const project = (x: number, y: number): [number, number] => [50 + (x - 50) * squeeze(y), y]
const poly = (points: [number, number][]) => `M${points.map(([x, y]) => project(x, y).map((n) => n.toFixed(2)).join(' ')).join('L')}Z`
const line = (points: [number, number][]) => `M${points.map(([x, y]) => project(x, y).map((n) => n.toFixed(2)).join(' ')).join('L')}`

function PitchLines() {
  const circle: [number, number][] = Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2
    return [50 + Math.cos(a) * 15, 48 + Math.sin(a) * 9.5]
  })
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <path d={poly([[3, 3], [97, 3], [97, 99], [3, 99]])} fill="#14783a" />
      {Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? <path key={i} d={poly([[3, 3 + i * 12], [97, 3 + i * 12], [97, 3 + (i + 1) * 12], [3, 3 + (i + 1) * 12]])} fill="#fff" opacity="0.05" /> : null))}
      <g fill="none" stroke="rgb(255 255 255 / 0.6)" strokeWidth="0.45" strokeLinejoin="round">
        <path d={poly([[3, 3], [97, 3], [97, 99], [3, 99]])} />
        <path d={line([[3, 48], [97, 48]])} />
        <path d={line(circle)} />
        <path d={line([[26, 3], [26, 19], [74, 19], [74, 3]])} />
        <path d={line([[38, 3], [38, 9], [62, 9], [62, 3]])} />
        <path d={line([[22, 99], [22, 80], [78, 80], [78, 99]])} />
        <path d={line([[36, 99], [36, 91], [64, 91], [64, 99]])} />
      </g>
    </svg>
  )
}

/** Resumo do time (geral com estrelas, formação, valor) e o campo em perspectiva com os titulares. Tocar num jogador abre o detalhe. */
export function Overview({ game, onOpen }: { game: Game; onOpen: (playerId: string) => void }) {
  const team = userTeam(game)
  const squad = squadOf(game, team.id)
  const byId = new Map(squad.map((p) => [p.id, p]))
  const strength = teamStrength(game, team)
  const value = squad.reduce((sum, p) => sum + marketValue(p, game.season.season.currentDate, team), 0)
  const formation = formationOf(team.tactic)
  const numbers = useRef(seedNumbers(new Map<string, number>(), game.season, game.userTeamId, 'home'))
  return (
    <div className="space-y-3" data-testid="squad-overview">
      <section className="card-bg grid grid-cols-[0.95fr_1.25fr_1.2fr] divide-x divide-white/[0.1] overflow-hidden rounded-[14px] border border-white/[0.13] py-3">
        <div className="flex flex-col items-center gap-1 px-2">
          <b className="font-display text-[38px] font-extrabold leading-none">{Math.round(strength)}</b>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Geral do time</span>
          <HalfStars value={teamStars(strength)} />
          <span className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, strength)}%` }} />
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 px-2">
          <MiniFormation tactic={team.tactic} className="h-11 w-7 shrink-0" />
          <span className="min-w-0">
            <b className="block whitespace-nowrap font-display text-[21px] font-bold leading-none" data-testid="overview-formation">{formationLabel(team.tactic.formationId)}</b>
            <span className="text-[11px] text-muted">Formação</span>
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 px-2">
          <Icon name="chart" size={30} className="shrink-0 text-accent" />
          <span className="min-w-0">
            <b className="block truncate font-display text-[17px] font-bold leading-tight">{formatCompactMoney(value)}</b>
            <span className="text-[11px] text-muted">Valor de mercado</span>
          </span>
        </div>
      </section>

      <section className="relative aspect-[100/126] w-full overflow-hidden rounded-[14px] border border-white/[0.13] bg-[#06100b]" data-testid="squad-field">
        <StadiumArt className="absolute inset-0 h-full w-full opacity-50" />
        <PitchLines />
        {team.tactic.startingXI.map((id, i) => {
          const player = byId.get(id)
          const point = formation.grid[i]
          const slot = formation.slots[i]
          if (!player || !point || !slot) return null
          const base = gridCoords(point)
          const [x, y] = project(base.x, base.y * 0.96 + 1)
          const k = squeeze(base.y)
          return <Token key={id} player={player} slotPosition={slot.position} number={assignNumber(numbers.current, 'home', id, slot.position)} colors={team.colors} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -62%) scale(${0.86 + 0.24 * k})` }} onOpen={() => onOpen(id)} />
        })}
      </section>
    </div>
  )
}

function Token({ player, slotPosition, number, colors, style, onOpen }: { player: Player; slotPosition: Player['position']; number: number; colors: [string, string]; style: React.CSSProperties; onOpen: () => void }) {
  const out = isUnavailable(player)
  return (
    <button type="button" onClick={onOpen} aria-label={`${playerName(player)}, ${POSITION_SHORT_LABELS[slotPosition]}, geral ${Math.round(playerOverall(player))}`} className="absolute flex w-[3.2rem] flex-col items-center" style={style}>
      <span className="relative">
        <Avatar id={player.id} colors={colors} size={34} ring />
        <span className="absolute -right-3 -top-1 rounded-full bg-black/75 px-1 font-display text-[12px] font-bold leading-[16px] text-accent">{number}</span>
        {out && <span className="absolute -left-1 -top-0.5 h-3 w-3 rounded-full bg-loss ring-2 ring-black/50" role="img" aria-label="Indisponível" />}
      </span>
      <span className="-mt-1 w-full rounded bg-black/75 px-0.5 leading-[15px] text-white">
        <FitName player={player} sizes={[10, 9.5, 9, 8.5]} />
      </span>
      <span className="rounded-b bg-black/60 px-1.5 text-[9.5px] font-extrabold leading-[13px] tracking-wide text-accent">{POSITION_SHORT_LABELS[slotPosition]}</span>
    </button>
  )
}
