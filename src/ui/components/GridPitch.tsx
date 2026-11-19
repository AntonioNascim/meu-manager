import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { formationOf } from '../../engine/formations'
import { GRID_ROWS, allGridPoints, gridKey } from '../../engine/grid'
import { readRoles, spotsOf } from '../../engine/spots'
import type { PitchSpot } from '../../engine/spots'
import { POSITION_LABELS, POSITION_SHORT_LABELS } from '../labels'
import type { GridPoint, Player, Position, Tactic } from '../../engine/types'
import { gridCoords, nearestGridPoint } from '../pitchLayout'

/** Quanto o dedo (ou o mouse) precisa andar, em pixels, para o toque virar arrastar. */
const DRAG_THRESHOLD = 8

const ROW_LABELS = ['GOL', 'DEF', 'VOL', 'MEIO', 'M.OF', 'ATA']

interface Drag {
  id: string
  /** Posição do dedo no campo (percentual). */
  x: number
  y: number
  target: GridPoint
}

/**
 * Campo da Escalação e da Tática com posicionamento livre: uma grade de pontos (linha × faixa) e cada titular numa
 * vaga dela. Tocar escolhe (para trocar de lugar com outro jogador); arrastar leva o jogador ao ponto mais perto do
 * dedo, ou troca de lugar com quem estiver nele. Funciona com o dedo (eventos de ponteiro, sem rolar a página
 * enquanto arrasta) e com o mouse.
 */
export function GridPitch({
  tactic,
  players,
  selectedId,
  onTap,
  onMove,
  spotHints,
  renderToken,
  testId = 'grid-pitch',
}: {
  tactic: Pick<Tactic, 'formationId' | 'startingXI'> & { grid?: GridPoint[] | undefined; spots?: PitchSpot[] | undefined }
  players: ReadonlyMap<string, Player>
  selectedId: string | null
  onTap: (playerId: string) => void
  /** `point` é o ponto da grade mais perto (o que o motor lê); `spot` é exatamente onde o jogador foi solto. */
  onMove: (playerId: string, point: GridPoint, spot: PitchSpot) => void
  /** Onde cada jogador foi solto na partida ao vivo (só para desenhar): vale enquanto ainda cai no ponto da grade em que o motor o pôs. */
  spotHints?: Readonly<Record<string, PitchSpot>>
  renderToken: (player: Player, slot: Position, selected: boolean, dragging: boolean) => ReactNode
  testId?: string
}) {
  const formation = formationOf(tactic)
  const field = useRef<HTMLDivElement>(null)
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  const latest = useRef<Drag | null>(null)
  const justDragged = useRef(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  const spots = spotsOf(tactic).map((s, i) => {
    const hint = spotHints?.[tactic.startingXI[i] as string]
    const point = formation.grid[i]
    return hint && point && gridKey(nearestGridPoint(hint.x, hint.y)) === gridKey(point) ? hint : s
  })
  const roles = readRoles(tactic, players)
  const points = useMemo(() => allGridPoints(), [])
  const occupied = new Set(formation.grid.map(gridKey))

  const place = (clientX: number, clientY: number, id: string): Drag | null => {
    const rect = field.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    return { id, x, y, target: nearestGridPoint(x, y, rect.width, rect.height) }
  }

  const down = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { id, x: e.clientX, y: e.clientY, moved: false }
    justDragged.current = false
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ponteiro sintético (testes): sem captura */
    }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s) return
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD) s.moved = true
    if (!s.moved) return
    const next = place(e.clientX, e.clientY, s.id)
    latest.current = next
    setDrag(next)
  }
  const end = (e: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    const s = start.current
    start.current = null
    const result = latest.current
    latest.current = null
    setDrag(null)
    if (!s?.moved) return
    justDragged.current = true
    setInfoId(s.id)
    if (!cancel && result) onMove(s.id, result.target, { x: result.x, y: result.y })
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* sem captura */
    }
  }
  const click = (id: string) => {
    // O clique que vem logo depois de soltar um arrasto não é um toque.
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    setInfoId(id)
    onTap(id)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap(id)
    }
  }

  const dragging = drag !== null
  const target = drag ? gridKey(drag.target) : null
  return (
    <div className="mx-auto w-full max-w-md">
    <div ref={field} className="relative aspect-[3/5.1] w-full select-none overflow-hidden rounded-2xl border border-emerald-950 bg-[#1d5a3a]" data-testid={testId}>
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

      {/* Pontos possíveis: discretos parados, em destaque (e com o nome da linha) enquanto se arrasta. */}
      {points.map((p) => {
        const c = gridCoords(p)
        const isTarget = target === gridKey(p)
        return (
          <span
            key={gridKey(p)}
            data-grid-point={gridKey(p)}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ${
              isTarget ? 'h-9 w-9 border-2 border-accent bg-accent/30' : dragging ? `h-3.5 w-3.5 border border-white/70 ${occupied.has(gridKey(p)) ? 'bg-white/10' : 'bg-white/35'}` : 'h-1.5 w-1.5 bg-white/25'
            }`}
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
          />
        )
      })}
      {dragging &&
        ROW_LABELS.map((label, row) => (
          <span key={label} className="pointer-events-none absolute left-1 -translate-y-1/2 text-[9px] font-extrabold tracking-wider text-white/45" style={{ top: `${gridCoords({ row, lane: 2 }).y}%` }}>
            {label}
          </span>
        ))}

      {tactic.startingXI.map((id, i) => {
        const player = players.get(id)
        const point = formation.grid[i]
        const slot = formation.slots[i]
        if (!player || !point || !slot) return null
        const c = spots[i] ?? gridCoords(point)
        const read = roles[i]
        const isDragged = drag?.id === id
        const at = isDragged && drag ? { x: drag.x, y: drag.y } : c
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            data-player={id}
            data-point={gridKey(point)}
            aria-label={`${player.nickname ?? player.name}: toque para escolher, arraste para mudar de posição`}
            onPointerDown={(e) => down(e, id)}
            onPointerMove={move}
            onPointerUp={(e) => end(e, false)}
            onPointerCancel={(e) => end(e, true)}
            onClick={() => click(id)}
            onKeyDown={(e) => key(e, id)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab outline-none ${isDragged ? 'z-30 scale-110 cursor-grabbing drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]' : 'z-10 transition-[left,top] duration-200'}`}
            style={{ left: `${at.x}%`, top: `${at.y}%`, touchAction: 'none' }}
          >
            {renderToken(player, slot.position, selectedId === id, isDragged)}
            {read && read.penalty > 0 && (
              <span className={`pointer-events-none absolute -left-2 -top-1 rounded-full px-1 text-[9px] font-extrabold leading-4 text-bg ${read.kind === 'out' ? 'bg-loss' : 'bg-draw'}`} data-testid="role-penalty" title="Penalidade por jogar fora da posição">
                −{read.penalty}%
              </span>
            )}
          </div>
        )
      })}
    </div>
    <RoleCard tactic={tactic} players={players} roles={roles} infoId={infoId} />
    </div>
  )
}

/**
 * O que o motor entendeu: o papel de cada jogador no ponto da grade mais perto de onde ele foi solto, a penalidade por jogar fora da
 * posição e o aviso quando a zona estava cheia e o motor o pôs num ponto vizinho.
 */
function RoleCard({ tactic, players, roles, infoId }: { tactic: Pick<Tactic, 'startingXI'>; players: ReadonlyMap<string, Player>; roles: ReturnType<typeof readRoles>; infoId: string | null }) {
  const i = infoId ? tactic.startingXI.indexOf(infoId) : -1
  const player = i >= 0 ? players.get(infoId as string) : undefined
  const read = i >= 0 ? roles[i] : undefined
  const moved = tactic.startingXI.flatMap((id, k) => (roles[k]?.moved ? [{ id, role: roles[k]?.role }] : []))
  return (
    <div className="mt-2 space-y-1.5 text-sm" data-testid="role-card">
      {player && read ? (
        <div className="rounded-xl border border-line bg-surface p-2.5">
          <p className="font-bold">{player.nickname ?? player.name}</p>
          <p className="text-muted">
            Posição dele: {POSITION_LABELS[player.position]}
            {player.secondaryPositions.length > 0 ? ` · secundárias: ${player.secondaryPositions.map((p) => POSITION_SHORT_LABELS[p]).join(', ')}` : ''}
          </p>
          <p className="mt-1">
            O motor entende: <b>{POSITION_LABELS[read.role]} ({POSITION_SHORT_LABELS[read.role]})</b>
          </p>
          <p className={read.penalty === 0 ? 'text-win' : read.kind === 'secondary' ? 'text-draw' : 'text-loss'} data-testid="role-penalty-text">
            {read.penalty === 0 ? 'Sem penalidade: é a posição principal dele.' : read.kind === 'secondary' ? `Penalidade de ${read.penalty}% na força: posição secundária.` : `Penalidade de ${read.penalty}% na força: fora da posição dele.`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">Toque ou arraste um jogador para ver o papel que o motor entende e a penalidade de posição.</p>
      )}
      {moved.length > 0 && (
        <p className="rounded-xl border border-draw/50 bg-draw/10 p-2 text-xs text-draw" data-testid="role-crowded">
          Zona cheia: o motor colocou {moved.map(({ id, role }) => `${players.get(id)?.nickname ?? players.get(id)?.name ?? id} em ${role ? POSITION_SHORT_LABELS[role] : ''}`).join(', ')} no ponto livre mais perto. Na tela cada um fica onde você soltou.
        </p>
      )}
    </div>
  )
}

/** Nome da linha da grade (para textos de ajuda). */
export const rowName = (row: number): string => ROW_LABELS[row] ?? GRID_ROWS[row] ?? ''
