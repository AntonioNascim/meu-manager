import { useEffect, useMemo, useRef, useState } from 'react'
import { getFormation } from '../../../engine/formations'
import type { MatchSnapshot } from '../../../engine/match'
import { teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { playerName } from '../../format'
import { assignNumber, beatsFor, inkFor, kitsFor, layoutFrom, pickTrace, playbackFor, shifted, slowFor, HOLD_MS, devFlag } from './pitchModel'
import type { Beat, Layout, MarkKind, Placed, Pt, Side } from './pitchModel'

/** Tempo de um minuto de jogo em 1x (ms), o mesmo da tela de partida. */
const MINUTE_MS = 700

const MARK_ICON: Record<MarkKind, { icon: string; cls: string; label: string }> = {
  goal: { icon: '⚽', cls: 'bg-accent text-accent-ink', label: 'Gol' },
  'own-goal': { icon: '⚽', cls: 'bg-loss text-bg', label: 'Gol contra' },
  save: { icon: '🧤', cls: 'bg-sky-300 text-bg', label: 'Defesa' },
  off: { icon: '✕', cls: 'bg-slate-300 text-bg', label: 'Para fora' },
  corner: { icon: '⚑', cls: 'bg-amber-300 text-bg', label: 'Escanteio' },
  foul: { icon: '●', cls: 'bg-white text-bg', label: 'Falta' },
  yellow: { icon: '▮', cls: 'bg-yellow-300 text-yellow-700', label: 'Cartão amarelo' },
  red: { icon: '▮', cls: 'bg-loss text-red-900', label: 'Cartão vermelho' },
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`

/** Linhas do campo (105 × 68). */
function FieldLines() {
  return (
    <svg viewBox="0 0 105 68" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 10.5} y="0" width="10.5" height="68" fill={i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)'} />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.35">
        <rect x="1.5" y="1.5" width="102" height="65" />
        <path d="M52.5 1.5v65" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="1.5" y="13.85" width="16.5" height="40.3" />
        <rect x="87" y="13.85" width="16.5" height="40.3" />
        <rect x="1.5" y="24.85" width="5.5" height="18.3" />
        <rect x="98" y="24.85" width="5.5" height="18.3" />
        <path d="M18 27.6a9.15 9.15 0 0 1 0 12.8M87 27.6a9.15 9.15 0 0 0 0 12.8" />
      </g>
      <g fill="rgba(255,255,255,0.85)">
        <circle cx="52.5" cy="34" r="0.5" />
        <circle cx="12" cy="34" r="0.5" />
        <circle cx="93" cy="34" r="0.5" />
      </g>
      <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4">
        <rect x="0" y="29" width="1.5" height="10" />
        <rect x="103.5" y="29" width="1.5" height="10" />
      </g>
    </svg>
  )
}

function Shirt({ shirt, trim, number, ink }: { shirt: string; trim: string; number: number; ink: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path d="M8 3 4 5 1.5 9l3 2L6 10v10h12V10l1.5 1 3-2L20 5l-4-2c-.5 1.5-2 2.3-4 2.3S8.5 4.5 8 3Z" fill={shirt} stroke={trim} strokeWidth="1.2" strokeLinejoin="round" />
      <text x="12" y="16.2" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="Barlow Condensed, sans-serif" fill={ink}>
        {number}
      </text>
    </svg>
  )
}

interface View {
  beat: Beat | null
  /** Duração das transições (ms). */
  glide: number
}

/**
 * Campo 2D animado: desenha o que o motor já gerou (rastro dos lances e eventos do snapshot), sincronizado com o
 * relógio da partida. A cada minuto simulado o lance mais recente vira uma sequência curta de batidas (meio,
 * progressão, chance, finalização); em 4x e 8x só a batida final aparece, sem setas.
 */
export function Pitch({ game, snap, speed, running }: { game: Game; snap: MatchSnapshot; speed: number; running: boolean }) {
  const home = teamById(game, snap.home.teamId)
  const away = teamById(game, snap.away.teamId)
  const kits = useMemo(() => kitsFor(home.colors, away.colors), [home.colors, away.colors])
  const wingers = {
    home: getFormation(snap.home.formationId).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
    away: getFormation(snap.away.formationId).slots.find((s) => s.position === 'RW' || s.position === 'LW')?.sector === 'attack',
  }
  const layout = useMemo(() => layoutFrom(snap, wingers), [snap, wingers.home, wingers.away]) // eslint-disable-line react-hooks/exhaustive-deps
  const known = useRef<Layout>(new Map())
  const numbers = useRef(new Map<string, number>())
  const names = useMemo(() => new Map(game.season.players.map((p) => [p.id, p])), [game.season.players])
  for (const [id, p] of layout) known.current.set(id, p)
  for (const p of layout.values()) assignNumber(numbers.current, p.side, p.playerId, p.slot)

  const [view, setView] = useState<View>({ beat: null, glide: 400 })
  const processed = useRef(0)
  const timers = useRef<number[]>([])
  const latest = useRef({ layout, known: known.current, snap })
  latest.current = { layout, known: known.current, snap }

  useEffect(() => {
    const traces = snap.trace
    if (traces.length < processed.current) processed.current = 0
    const fresh = traces.slice(processed.current)
    processed.current = traces.length
    if (fresh.length === 0) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    const last = pickTrace(fresh)
    if (!last) return
    const beats = beatsFor(last, new Map([...latest.current.known, ...latest.current.layout]), snap.events)
    if (beats.length === 0) return
    // Finalizações e gols passam em câmera lenta em qualquer velocidade (o relógio da partida espera: ver `holdFor`).
    // Em desenvolvimento, &anim=1 mostra a sequência completa mesmo ao abrir a partida no meio (para conferir as setas).
    const forceFull = devFlag('anim')
    const slow = fresh.length <= 2 || forceFull ? slowFor(last) : 0
    const tick = slow || MINUTE_MS / speed
    const simplified = !forceFull && !slow && (speed >= 4 || fresh.length > 2)
    const { beats: seq, arrows } = playbackFor(beats, slow ? 1 : speed, simplified)
    const slot = tick / Math.max(1, seq.length)
    const glide = !arrows ? Math.min(160, tick) : Math.max(90, Math.min(480, slot * 0.9))
    seq.forEach((beat, i) => {
      const show = () => setView({ beat: { ...beat, arrow: arrows ? beat.arrow : undefined } as Beat, glide })
      if (i === 0) show()
      else timers.current.push(window.setTimeout(show, slot * i))
    })
  }, [snap.trace.length, snap.minute]) // eslint-disable-line react-hooks/exhaustive-deps
  // Ao sair (ou no remonte do modo estrito de desenvolvimento) os temporizadores caem e o campo volta a desenhar o último lance.
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
      processed.current = 0
    },
    [],
  )

  // Cartão: aparece na tela, com o nome de quem levou, por um instante.
  // (em desenvolvimento, &anim=1 mostra também os cartões do minuto em que a partida foi aberta)
  const seenEvents = useRef(devFlag('anim') ? snap.events.findIndex((e) => e.minute >= snap.minute) >>> 0 : snap.events.length)
  const cardTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(cardTimer.current), [])
  const [card, setCard] = useState<{ kind: 'yellow' | 'red'; name: string; team: string; key: number } | null>(null)
  useEffect(() => {
    if (snap.events.length < seenEvents.current) seenEvents.current = 0
    const fresh = snap.events.slice(seenEvents.current)
    seenEvents.current = snap.events.length
    const shown = [...fresh].reverse().find((e) => e.type === 'yellow-card' || e.type === 'red-card')
    if (!shown) return
    const who = names.get(shown.playerId)
    setCard({ kind: shown.type === 'red-card' ? 'red' : 'yellow', name: who ? playerName(who) : '', team: teamById(game, shown.teamId).abbreviation, key: snap.events.length })
    window.clearTimeout(cardTimer.current)
    cardTimer.current = window.setTimeout(() => setCard(null), HOLD_MS.card)
  }, [snap.events.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const beat = view.beat
  const position = (p: Placed): Pt => {
    if (!beat) return p.base
    return beat.moves[p.playerId] ?? shifted(p, beat.attSide, beat.phase, beat.focusY)
  }
  const holder = beat?.holder ? layout.get(beat.holder) : undefined
  const holderName = beat?.holder ? names.get(beat.holder) : undefined
  const ball = beat?.ball ?? { x: 0.5, y: 0.5 }
  const transition = { transition: `left ${view.glide}ms ease-in-out, top ${view.glide}ms ease-in-out` }
  const arrow = beat?.arrow

  const colorsOf = (side: Side, slot: Placed['slot']) => {
    const k = kits[side]
    const shirt = slot === 'GK' ? k.keeper : k.shirt
    return { shirt, trim: slot === 'GK' ? k.shirt : k.trim, ink: inkFor(shirt) }
  }

  const holderPos = holder ? position(holder) : undefined

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-green-700 to-green-800 shadow-inner" data-testid="pitch">
      <div className="relative aspect-[105/68] w-full select-none">
        <FieldLines />
        {arrow && (
          <svg viewBox="0 0 105 68" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id="pitch-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M0 0 6 3 0 6Z" fill={arrow.solid ? '#fde047' : '#7dd3fc'} />
              </marker>
            </defs>
            <path
              d={
                arrow.curve
                  ? `M${arrow.from.x * 105} ${arrow.from.y * 68} Q${((arrow.from.x + arrow.to.x) / 2) * 105} ${(Math.min(arrow.from.y, arrow.to.y) - 0.12) * 68} ${arrow.to.x * 105} ${arrow.to.y * 68}`
                  : `M${arrow.from.x * 105} ${arrow.from.y * 68} L${arrow.to.x * 105} ${arrow.to.y * 68}`
              }
              fill="none"
              stroke={arrow.solid ? '#fde047' : '#7dd3fc'}
              strokeWidth="0.6"
              strokeDasharray={arrow.solid ? undefined : '2 1.4'}
              markerEnd="url(#pitch-arrow)"
            />
          </svg>
        )}

        {[...layout.values()].map((p) => {
          const at = position(p)
          const c = colorsOf(p.side, p.slot)
          const isHolder = holder?.playerId === p.playerId
          return (
            <div
              key={p.playerId}
              className={`pitch-player absolute h-[8%] min-h-[20px] w-[5.4%] min-w-[20px] -translate-x-1/2 -translate-y-1/2 ${isHolder ? 'z-20 drop-shadow-[0_0_6px_rgba(212,255,46,0.95)]' : 'z-10'}`}
              style={{ left: pct(at.x), top: pct(at.y), ...transition }}
              data-player={p.playerId}
              data-side={p.side}
            >
              {isHolder && <span className="absolute -inset-1 animate-pulse rounded-full border-2 border-accent/80" />}
              <Shirt shirt={c.shirt} trim={c.trim} ink={c.ink} number={numbers.current.get(`${p.side}:${p.playerId}`) ?? 0} />
            </div>
          )
        })}

        {holder && holderPos && holderName && (
          <div className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-bg/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow ring-1 ring-accent/60" style={{ left: pct(Math.min(0.88, Math.max(0.12, holderPos.x))), top: holderPos.y < 0.2 ? `calc(${pct(holderPos.y)} + 14px)` : `calc(${pct(holderPos.y)} - 11px)`, transform: holderPos.y < 0.2 ? 'translateX(-50%)' : undefined, ...transition }}>
            <span className="mr-1 rounded bg-accent px-1 text-accent-ink">{numbers.current.get(`${holder.side}:${holder.playerId}`)}</span>
            {playerName(holderName)}
          </div>
        )}

        <div className="pointer-events-none absolute z-30 h-[3.2%] min-h-[7px] w-[2.2%] min-w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/60" style={{ left: pct(ball.x), top: pct(ball.y), ...transition }} aria-label="Bola" />

        {beat?.marks.map((m, i) => (
          <div key={`${m.kind}-${i}-${snap.minute}`} className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2" style={{ left: pct(Math.min(0.94, Math.max(0.06, m.at.x))), top: pct(Math.min(0.95, Math.max(0.05, m.at.y))) }} title={MARK_ICON[m.kind].label}>
            <span className={`pitch-mark flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold shadow ring-2 ring-white/70 ${MARK_ICON[m.kind].cls}`} role="img" aria-label={MARK_ICON[m.kind].label}>
              {MARK_ICON[m.kind].icon}
            </span>
          </div>
        ))}

        {card && (
          <div key={card.key} className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2" role="status" aria-label={`Cartão ${card.kind === 'red' ? 'vermelho' : 'amarelo'}: ${card.name}`} data-testid="pitch-card">
            <div className="pitch-mark flex flex-col items-center gap-1">
              <span className={`block h-14 w-10 rotate-6 rounded-md shadow-lg ring-2 ring-white/80 ${card.kind === 'red' ? 'bg-red-600' : 'bg-yellow-300'}`} />
              <span className="whitespace-nowrap rounded-md bg-bg/90 px-2 py-0.5 text-xs font-bold text-white shadow ring-1 ring-white/30">
                {card.name} <span className="text-muted">({card.team})</span>
              </span>
            </div>
          </div>
        )}

        <span className="pointer-events-none absolute left-2 top-1 text-[10px] font-bold uppercase tracking-wider text-white/70">{home.abbreviation} →</span>
        <span className="pointer-events-none absolute right-2 top-1 text-[10px] font-bold uppercase tracking-wider text-white/70">← {away.abbreviation}</span>
        {!running && snap.minute > 0 && !snap.finished && <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-bg/70 px-2 py-0.5 text-[10px] font-bold text-muted">pausado</span>}
      </div>
    </div>
  )
}
