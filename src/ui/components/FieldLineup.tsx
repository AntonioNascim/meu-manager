import { useMemo } from 'react'
import { getFormation } from '../../engine/formations'
import type { GridPoint, Player, Position } from '../../engine/types'
import { playerName } from '../format'
import { gridCoords, pitchLayout } from '../pitchLayout'
import type { PitchPoint } from '../pitchLayout'
import { inkFor } from '../screens/match/pitchModel'
import { conditionBand } from '../colors'
import { Jersey } from '../theme'
import { GridPitch } from './GridPitch'

export interface FieldSlot {
  playerId: string
  slot: Position
  /** Ponto da grade que ocupa (posicionamento livre); sem ele, a vaga da formação pelo papel. */
  point?: GridPoint | undefined
}

/** Nome curto para caber embaixo da camisa. */
export function shortPlayerName(p: Pick<Player, 'name' | 'nickname'>): string {
  const name = playerName(p)
  const parts = name.split(' ')
  return parts.length > 1 && !p.nickname ? (parts[parts.length - 1] as string) : name
}

/**
 * Põe cada jogador na vaga da formação: a vaga pega o primeiro jogador da mesma posição que ainda não foi colocado;
 * se sobrar alguém (posições trocadas durante o jogo), ele ocupa as vagas que sobraram.
 */
export function placeLineup(formationId: string, lineup: readonly FieldSlot[]): { entry: FieldSlot; point: PitchPoint }[] {
  // Com o ponto da grade de todos, cada um fica exatamente onde está (inclusive no posicionamento livre).
  if (lineup.length > 0 && lineup.every((e) => e.point)) return lineup.map((entry) => ({ entry, point: gridCoords(entry.point as GridPoint) }))
  const slots = getFormation(formationId).slots
  const points = pitchLayout(formationId)
  const left = [...lineup]
  const placed: { entry: FieldSlot; point: PitchPoint }[] = []
  const free: number[] = []
  slots.forEach((slot, i) => {
    const at = left.findIndex((e) => e.slot === slot.position)
    if (at < 0) free.push(i)
    else placed.push({ entry: left.splice(at, 1)[0] as FieldSlot, point: points[i] as PitchPoint })
  })
  for (const entry of left) {
    const i = free.shift()
    if (i !== undefined) placed.push({ entry, point: points[i] as PitchPoint })
  }
  return placed
}

export interface Kit {
  shirt: string
  trim: string
}

function Token({ player, number, fitness, yellow, kit, selected, onTap }: { player: Player; number: number; fitness: number; yellow: boolean; kit: Kit; selected: boolean; onTap?: () => void }) {
  const body = (
    <>
      <span className={`relative rounded-full p-0.5 ${selected ? 'bg-white/90 ring-4 ring-white/60' : ''}`}>
        <Jersey team={{ colors: [kit.shirt, kit.trim] }} size={40} />
        <span className="absolute inset-x-0 top-[44%] -translate-y-1/2 text-center font-display text-[13px] font-extrabold leading-none" style={{ color: inkFor(kit.shirt) }}>
          {number}
        </span>
        {yellow && <span className="absolute -right-1 -top-0.5 h-3.5 w-2.5 rounded-[2px] bg-amber-300 ring-1 ring-black/40" role="img" aria-label="Cartão amarelo" />}
      </span>
      <span className="w-full truncate rounded bg-black/75 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{shortPlayerName(player)}</span>
      <span className={`rounded px-1.5 text-[11px] font-extrabold leading-[18px] tabular-nums text-bg ${conditionBand(fitness).bg}`} title="Condição física">
        {Math.round(fitness)}%
      </span>
    </>
  )
  const cls = 'flex w-[3.9rem] flex-col items-center gap-0.5'
  return onTap ? (
    <button type="button" onClick={onTap} className={cls} aria-label={`${playerName(player)}, ${Math.round(fitness)}% de condição`} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/**
 * Campo com os titulares no desenho da Escalação: camisa com número, nome e condição física. Com `onTap` cada jogador é
 * um botão (usado nas Trocas); sem ele é só leitura (escalação provável do adversário).
 */
export function FieldLineup({
  formationId,
  lineup,
  players,
  kit,
  keeperKit,
  numberOf,
  fitnessOf,
  yellowOf,
  selectedId,
  onTap,
  onMove,
}: {
  formationId: string
  lineup: readonly FieldSlot[]
  players: ReadonlyMap<string, Player>
  kit: Kit
  keeperKit?: Kit
  numberOf: (playerId: string, slot: Position) => number
  fitnessOf: (playerId: string) => number
  yellowOf?: (playerId: string) => boolean
  selectedId?: string | null
  onTap?: (playerId: string) => void
  /** Com ele o campo vira a grade de posicionamento: arrastar leva o jogador ao ponto mais perto (ponto ocupado = troca). */
  onMove?: (playerId: string, point: GridPoint) => void
}) {
  const placed = useMemo(() => placeLineup(formationId, lineup), [formationId, lineup])
  if (onMove && lineup.length > 0 && lineup.every((e) => e.point)) {
    return (
      <GridPitch
        testId="field-lineup"
        tactic={{ formationId, startingXI: lineup.map((e) => e.playerId), grid: lineup.map((e) => e.point as GridPoint) }}
        players={players}
        selectedId={selectedId ?? null}
        onTap={(id) => onTap?.(id)}
        onMove={onMove}
        renderToken={(player, slot, selected) => (
          <Token player={player} number={numberOf(player.id, slot)} fitness={fitnessOf(player.id)} yellow={yellowOf?.(player.id) ?? false} kit={slot === 'GK' && keeperKit ? keeperKit : kit} selected={selected} />
        )}
      />
    )
  }
  return (
    <div className="relative mx-auto aspect-[3/5.1] w-full max-w-md overflow-hidden rounded-2xl border border-emerald-950 bg-[#1d5a3a]" data-testid="field-lineup">
      <div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgb(255_255_255/0.045)_0_12.5%,transparent_12.5%_25%)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 170" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.55">
          <rect x="4" y="4" width="92" height="162" />
          <line x1="4" y1="85" x2="96" y2="85" />
          <circle cx="50" cy="85" r="11" />
          <rect x="24" y="4" width="52" height="21" />
          <rect x="38" y="4" width="24" height="8" />
          <rect x="24" y="145" width="52" height="21" />
          <rect x="38" y="158" width="24" height="8" />
        </g>
      </svg>
      {placed.map(({ entry, point }) => {
        const player = players.get(entry.playerId)
        if (!player) return null
        return (
          <div key={entry.playerId} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${point.x}%`, top: `${point.y}%` }} data-player={entry.playerId}>
            <Token
              player={player}
              number={numberOf(entry.playerId, entry.slot)}
              fitness={fitnessOf(entry.playerId)}
              yellow={yellowOf?.(entry.playerId) ?? false}
              kit={entry.slot === 'GK' && keeperKit ? keeperKit : kit}
              selected={selectedId === entry.playerId}
              {...(onTap ? { onTap: () => onTap(entry.playerId) } : {})}
            />
          </div>
        )
      })}
    </div>
  )
}
