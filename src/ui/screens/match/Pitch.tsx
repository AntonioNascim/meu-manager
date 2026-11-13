import { useEffect, useMemo, useRef, useState } from 'react'
import { slotAt } from '../../../engine/grid'
import type { MatchSnapshot } from '../../../engine/match'
import type { Player } from '../../../engine/types'
import { playerName } from '../../format'
import { assignNumber, beatsFor, inkFor, kitsFor, layoutFrom, pickTrace, HOLD_MS, devFlag, devParam } from './pitchModel'
import type { Beat, Layout, Mark, MarkKind, Placed, Side } from './pitchModel'
import { PitchMotion, choosePlan } from './pitchMotion'

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

/** O que o campo precisa saber do mundo: cores e sigla dos dois times e o nome dos jogadores (o jogo solo passa o `season`; a liga online, o `roster`). */
export interface PitchTeam {
  id: string
  colors: readonly [string, string]
  abbreviation: string
}
export interface PitchData {
  teams: readonly PitchTeam[]
  players: readonly Pick<Player, 'id' | 'name' | 'nickname'>[]
}

/**
 * Campo 2D animado: desenha o que o motor já gerou (rastro dos lances e eventos do snapshot), sincronizado com o relógio da partida.
 * O movimento é contínuo (`PitchMotion`): a cada quadro os 22 jogadores e a bola andam, e só `transform` é escrito no DOM (nada passa pelo
 * React por quadro). Cada minuto simulado vira trechos da bola (passes de ligação + as batidas do lance), que partem de onde a bola está.
 */
export function Pitch({ data, snap, speed, running, numbers: shared }: { data: PitchData; snap: MatchSnapshot; speed: number; running: boolean; numbers?: Map<string, number> }) {
  const teamOf = (id: string) => data.teams.find((t) => t.id === id) as PitchTeam
  const home = teamOf(snap.home.teamId)
  const away = teamOf(snap.away.teamId)
  const kits = useMemo(() => kitsFor(home.colors, away.colors), [home.colors, away.colors])
  const wingers = {
    home: snap.home.grid.map(slotAt).some((s) => (s.position === 'RW' || s.position === 'LW') && s.sector === 'attack'),
    away: snap.away.grid.map(slotAt).some((s) => (s.position === 'RW' || s.position === 'LW') && s.sector === 'attack'),
  }
  const layout = useMemo(() => layoutFrom(snap, wingers), [snap, wingers.home, wingers.away]) // eslint-disable-line react-hooks/exhaustive-deps
  const known = useRef<Layout>(new Map())
  const ownNumbers = useRef(new Map<string, number>())
  // Os números podem vir de fora (as Trocas usam os mesmos); sem eles o campo guarda os seus.
  const numbers = { current: shared ?? ownNumbers.current }
  const names = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])
  for (const [id, p] of layout) known.current.set(id, p)
  for (const p of layout.values()) assignNumber(numbers.current, p.side, p.playerId, p.slot)

  // O movimento mora fora do React: o objeto guarda posição e velocidade de todos e é escrito no DOM por quadro.
  const motion = useRef<PitchMotion | null>(null)
  if (!motion.current) motion.current = new PitchMotion()
  motion.current.setLayout(layout, { home: snap.home.activeMentality, away: snap.away.activeMentality })
  const field = useRef<HTMLDivElement | null>(null)
  const size = useRef({ w: 0, h: 0 })
  const playerEls = useRef(new Map<string, HTMLElement>())
  const ballEl = useRef<HTMLDivElement | null>(null)
  const labelEl = useRef<HTMLDivElement | null>(null)
  const labelText = useRef<HTMLSpanElement | null>(null)
  const arrowEl = useRef<SVGPathElement | null>(null)
  const lineEl = useRef<HTMLParagraphElement | null>(null)
  const fpsEl = useRef<HTMLSpanElement | null>(null)
  const live = useRef({ speed, running, names, numbers: numbers.current })
  live.current = { speed, running, names, numbers: numbers.current }

  const [marks, setMarks] = useState<Mark[]>([])
  const processed = useRef(0)
  const latest = useRef({ layout, known: known.current, snap })
  latest.current = { layout, known: known.current, snap }
  const nameOf = (id: string): string => {
    const p = live.current.names.get(id)
    return p ? playerName(p) : ''
  }

  // Novo lance do motor: vira trechos da bola, a partir de onde ela está.
  useEffect(() => {
    const traces = snap.trace
    if (traces.length < processed.current) processed.current = 0
    const fresh = traces.slice(processed.current)
    processed.current = traces.length
    if (fresh.length === 0) return
    const last = pickTrace(fresh)
    if (!last) return
    const beats = beatsFor(last, new Map([...latest.current.known, ...latest.current.layout]), snap.events, new Set(latest.current.layout.keys()))
    if (beats.length === 0) return
    // Finalizações e gols passam em câmera lenta em qualquer velocidade (o relógio da partida espera: ver `holdFor`).
    // Em desenvolvimento, &anim=1 mostra a sequência completa mesmo ao abrir a partida no meio.
    const choice = choosePlan(beats, last, fresh.length, speed, devFlag('anim'))
    const { tick, connectors, quick, setPiece } = choice
    let seq = choice.seq
    // Em desenvolvimento, &passo=N mostra só a batida N da sequência (para conferir a cena parada).
    const only = devParam('passo')
    if (only !== null && seq[Number(only)]) seq = [seq[Number(only)] as Beat]
    setMarks([])
    motion.current?.plan(seq, { trace: last, names: nameOf, tickMs: tick, connectors, arrows: !quick, setPiece, floors: !quick })
  }, [snap.trace.length, snap.minute]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setCard({ kind: shown.type === 'red-card' ? 'red' : 'yellow', name: who ? playerName(who) : '', team: teamOf(shown.teamId).abbreviation, key: snap.events.length })
    window.clearTimeout(cardTimer.current)
    cardTimer.current = window.setTimeout(() => setCard(null), HOLD_MS.card)
  }, [snap.events.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tamanho do campo em pixels (as posições do movimento são proporções; o DOM recebe px por transform).
  useEffect(() => {
    const el = field.current
    if (!el) return
    const measure = () => {
      size.current = { w: el.clientWidth, h: el.clientHeight }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // O laço de quadros: avança o movimento e escreve só `transform` (e o texto da narração quando muda de trecho).
  useEffect(() => {
    const m = motion.current as PitchMotion
    const stats = { frames: 0, since: 0, worst: 0, cpu: 0, deltas: [] as number[] }
    const wantFps = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fps')
    const lastPx = new Map<string, number>()
    let raf = 0
    let prev = performance.now()
    let lastHolder: string | undefined

    const draw = () => {
      const { w, h } = size.current
      if (w === 0) return
      for (const [id, body] of m.bodies) {
        const el = playerEls.current.get(id)
        if (!el) continue
        const dx = (body.pos.x - body.placed.base.x) * w
        const dy = (body.pos.y - body.placed.base.y) * h
        const key = dx * 4096 + dy
        if (lastPx.get(id) === key) continue
        lastPx.set(id, key)
        el.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`
      }
      const ball = ballEl.current
      if (ball) {
        const s = 1 + 0.7 * m.ball.height
        ball.style.transform = `translate3d(${((m.ball.pos.x - 0.5) * w).toFixed(1)}px,${((m.ball.pos.y - 0.5) * h).toFixed(1)}px,0) scale(${s.toFixed(2)})`
      }
      const label = labelEl.current
      const who = lastHolder ? m.bodies.get(lastHolder) : undefined
      if (label) {
        if (who) {
          const x = Math.min(0.88, Math.max(0.12, who.pos.x)) * w
          const below = who.pos.y < 0.2
          label.style.transform = `translate3d(${x.toFixed(1)}px,${(who.pos.y * h + (below ? 14 : -11)).toFixed(1)}px,0)`
          label.style.visibility = 'visible'
        } else label.style.visibility = 'hidden'
      }
    }

    const showArrow = (leg: NonNullable<PitchMotion['leg']>) => {
      const path = arrowEl.current
      if (!path) return
      if (!leg.arrow || !leg.start) {
        path.setAttribute('d', '')
        return
      }
      const a = leg.start
      const b = leg.toPt
      const d = leg.curve ? `M${a.x * 105} ${a.y * 68} Q${((a.x + b.x) / 2) * 105} ${(Math.min(a.y, b.y) - 0.12) * 68} ${b.x * 105} ${b.y * 68}` : `M${a.x * 105} ${a.y * 68} L${b.x * 105} ${b.y * 68}`
      const solid = leg.kind === 'shot'
      path.setAttribute('d', d)
      path.setAttribute('stroke', solid ? '#fde047' : '#7dd3fc')
      if (solid) path.removeAttribute('stroke-dasharray')
      else path.setAttribute('stroke-dasharray', '2 1.4')
    }

    const loop = (now: number) => {
      const t0 = performance.now()
      const dt = now - prev
      prev = now
      const events = m.step(dt, { running: live.current.running, speed: live.current.speed })
      for (const ev of events) {
        if (ev.type === 'start') {
          if (lineEl.current) lineEl.current.textContent = ev.leg.text
          showArrow(ev.leg)
        } else {
          if (ev.leg.endText && lineEl.current) lineEl.current.textContent = ev.leg.endText
          if (ev.leg.marks.length > 0) setMarks(ev.leg.marks)
          if (arrowEl.current) arrowEl.current.setAttribute('d', '')
        }
        const holder = ev.type === 'end' ? ev.holder : undefined
        if (holder && holder !== lastHolder) {
          // O destaque e o nome seguem quem recebe a bola (classe no próprio elemento: nada passa pelo React).
          if (lastHolder) playerEls.current.get(lastHolder)?.classList.remove('pitch-holder')
          playerEls.current.get(holder)?.classList.add('pitch-holder')
          lastHolder = holder
          const p = live.current.names.get(holder)
          const body = m.bodies.get(holder)
          if (labelText.current && p && body) labelText.current.textContent = `${live.current.numbers.get(`${body.placed.side}:${holder}`) ?? ''} ${playerName(p)}`
        }
      }
      draw()
      if (wantFps) {
        const cost = performance.now() - t0
        stats.frames++
        stats.cpu += cost
        stats.worst = Math.max(stats.worst, dt)
        stats.deltas.push(dt)
        if (stats.since === 0) stats.since = now
        if (now - stats.since >= 1000) {
          const sorted = [...stats.deltas].sort((x, y) => x - y)
          const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
          const out = { fps: Math.round((stats.frames * 1000) / (now - stats.since)), p95: Math.round(p95 * 10) / 10, worst: Math.round(stats.worst), cpu: Math.round((stats.cpu / stats.frames) * 100) / 100 }
          const w = window as unknown as { __pitchFps?: unknown[] }
          w.__pitchFps = [...(w.__pitchFps ?? []), out]
          if (fpsEl.current) fpsEl.current.textContent = `${out.fps} fps · p95 ${out.p95} ms · cpu ${out.cpu} ms`
          stats.frames = 0
          stats.since = now
          stats.worst = 0
          stats.cpu = 0
          stats.deltas = []
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const colorsOf = (side: Side, slot: Placed['slot']) => {
    const k = kits[side]
    const shirt = slot === 'GK' ? k.keeper : k.shirt
    return { shirt, trim: slot === 'GK' ? k.shirt : k.trim, ink: inkFor(shirt) }
  }

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-green-700 to-green-800 shadow-inner" data-testid="pitch">
      <div ref={field} className="relative aspect-[105/68] w-full select-none">
        <FieldLines />
        <svg viewBox="0 0 105 68" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <path ref={arrowEl} d="" fill="none" stroke="#7dd3fc" strokeWidth="0.6" strokeDasharray="2 1.4" opacity="0.9" />
        </svg>

        {[...layout.values()].map((p) => {
          const c = colorsOf(p.side, p.slot)
          return (
            <div
              key={p.playerId}
              ref={(el) => {
                if (el) playerEls.current.set(p.playerId, el)
                else playerEls.current.delete(p.playerId)
              }}
              className={`pitch-player absolute h-[8%] min-h-[20px] w-[5.4%] min-w-[20px] -translate-x-1/2 -translate-y-1/2 will-change-transform z-10`}
              style={{ left: pct(p.base.x), top: pct(p.base.y) }}
              data-player={p.playerId}
              data-side={p.side}
            >
              <Shirt shirt={c.shirt} trim={c.trim} ink={c.ink} number={numbers.current.get(`${p.side}:${p.playerId}`) ?? 0} />
            </div>
          )
        })}

        <div ref={labelEl} className="pointer-events-none absolute left-0 top-0 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-bg/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow ring-1 ring-accent/60 will-change-transform" style={{ visibility: 'hidden' }}>
          <span ref={labelText} />
        </div>

        <div ref={ballEl} className="pointer-events-none absolute z-30 h-[3.2%] min-h-[7px] w-[2.2%] min-w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/60 will-change-transform" style={{ left: '50%', top: '50%' }} aria-label="Bola" />

        {marks.map((m, i) => (
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
        <span ref={fpsEl} className="pointer-events-none absolute bottom-1 right-1 z-50 text-[10px] font-bold text-white/80" />
      </div>
      <p ref={lineEl} className="min-h-[2.1rem] border-t border-white/10 bg-black/25 px-3 py-1.5 text-[12.5px] font-semibold leading-snug text-slate-100" data-testid="pitch-line" aria-live="off" />
    </div>
  )
}
