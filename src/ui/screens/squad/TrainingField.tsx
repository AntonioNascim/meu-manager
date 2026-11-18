import { useEffect, useMemo, useRef, useState } from 'react'
import { DRILL_LABELS, DRILL_ZONE_LABELS, REST_LABEL } from '../../labels'
import { TrainingMotion } from './trainingMotion'
import { FIELD_SIZE, SCENES } from './trainingScenes'
import type { Area, SceneId } from './trainingScenes'

export interface TrainingFieldColors {
  /** Os titulares e os reservas (ou rivais do exercício): cor da camisa e do número. */
  a: { fill: string; ink: string }
  b: { fill: string; ink: string }
}

const NEUTRAL = { fill: '#e2e8f0', ink: '#0f172a' }
const SPEEDS = [1, 2, 4] as const
type Speed = (typeof SPEEDS)[number]

const hole = (a: Area) => `M0 0H${FIELD_SIZE.w}V${FIELD_SIZE.h}H0Z M${a.x} ${a.y}h${a.w}v${a.h}h${-a.w}Z`

function usePrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * O campinho do treino: mostra onde o exercício acontece (a zona fica clara, o resto apagado), quem participa e a bola, tudo se mexendo a
 * 60 quadros por segundo. Só desenha (nada aqui entra em conta do jogo): os titulares com o número da camisa, os reservas ou rivais do
 * exercício, cones, escadas e gols. Os jogos reduzidos viram um mini-jogo com placar e relógio de enfeite.
 */
export function TrainingField({ scene, seed, colors, numbersA = [], numbersB = [], caption }: { scene: SceneId; seed: string; colors: TrainingFieldColors; numbersA?: readonly number[]; numbersB?: readonly number[]; /** Texto no lugar do nome do exercício (dia sem treino montado). */ caption?: string }) {
  const spec = SCENES[scene]
  const reduced = usePrefersReducedMotion()
  const [speed, setSpeed] = useState<Speed>(1)
  const [paused, setPaused] = useState(reduced)
  const motion = useMemo(() => new TrainingMotion(spec, `${seed}:${scene}`), [spec, seed, scene])
  const bodyEls = useRef<(SVGGElement | null)[]>([])
  const ballEl = useRef<SVGGElement | null>(null)
  const ballShadow = useRef<SVGEllipseElement | null>(null)
  const clockEl = useRef<HTMLSpanElement | null>(null)
  const scoreEl = useRef<HTMLSpanElement | null>(null)
  const live = useRef({ speed, paused })
  live.current = { speed, paused }

  const numberOf = (side: 'a' | 'b' | 'n', i: number): string => {
    if (side === 'n') return ''
    const list = side === 'a' ? numbersA : numbersB
    const nth = motion.bodies.filter((b, k) => b.side === side && k < i).length
    return String(list[nth] ?? nth + 1)
  }

  useEffect(() => {
    let raf = 0
    let prev = performance.now()
    let lastScore = ''
    let lastClock = -1
    const draw = () => {
      motion.bodies.forEach((b, i) => bodyEls.current[i]?.setAttribute('transform', `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`))
      const ball = ballEl.current
      if (ball) ball.setAttribute('transform', `translate(${motion.ball.x.toFixed(2)} ${(motion.ball.y - motion.ball.height * 3).toFixed(2)}) scale(${(1 + motion.ball.height * 0.5).toFixed(2)})`)
      const shadow = ballShadow.current
      if (shadow) {
        shadow.setAttribute('cx', motion.ball.x.toFixed(2))
        shadow.setAttribute('cy', (motion.ball.y + 0.5).toFixed(2))
        shadow.setAttribute('opacity', (0.35 - motion.ball.height * 0.15).toFixed(2))
      }
      if (spec.game) {
        const minute = Math.floor(motion.minute)
        if (clockEl.current && minute !== lastClock) {
          lastClock = minute
          clockEl.current.textContent = `${minute}'`
        }
        const score = `${motion.score.a} × ${motion.score.b}`
        if (scoreEl.current && score !== lastScore) {
          lastScore = score
          scoreEl.current.textContent = score
        }
      }
    }
    const loop = (now: number) => {
      const dt = now - prev
      prev = now
      if (!live.current.paused && !document.hidden) motion.step(dt, live.current.speed)
      draw()
      raf = requestAnimationFrame(loop)
    }
    draw()
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [motion, spec.game])

  const name = scene === 'rest' ? REST_LABEL : scene === 'idle' ? (caption ?? '') : DRILL_LABELS[scene].name
  return (
    <div className="space-y-2" data-testid="training-field" data-scene={scene}>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-green-800 shadow-inner">
        <svg viewBox={`0 0 ${FIELD_SIZE.w} ${FIELD_SIZE.h}`} className="block aspect-[105/68] w-full" role="img" aria-label={`Campo de treino: ${name}, ${DRILL_ZONE_LABELS[spec.zone]}`}>
          <rect width={FIELD_SIZE.w} height={FIELD_SIZE.h} fill="#15803d" />
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={i * 10.5} y="0" width="10.5" height={FIELD_SIZE.h} fill={i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} />
          ))}
          <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.35">
            <rect x="1.5" y="1.5" width="102" height="65" />
            <path d="M52.5 1.5v65" />
            <circle cx="52.5" cy="34" r="9.15" />
            <rect x="1.5" y="13.85" width="16.5" height="40.3" />
            <rect x="87" y="13.85" width="16.5" height="40.3" />
            <rect x="1.5" y="24.85" width="5.5" height="18.3" />
            <rect x="98" y="24.85" width="5.5" height="18.3" />
          </g>
          <path d={hole(spec.area)} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
          <rect x={spec.area.x} y={spec.area.y} width={spec.area.w} height={spec.area.h} fill="none" stroke="#d4ff2e" strokeWidth="0.5" strokeDasharray="1.6 1.2" data-testid="training-zone" />
          {spec.goals.map((g, i) => (
            <rect key={`g${i}`} x={g.x} y={g.y} width={g.w} height={g.h} fill="rgba(255,255,255,0.15)" stroke="#fff" strokeWidth="0.35" />
          ))}
          {spec.ladders.map((l, i) => (
            <g key={`l${i}`} fill="none" stroke="#facc15" strokeWidth="0.3">
              <rect x={l.x} y={l.y} width={l.w} height={l.h} />
              {Array.from({ length: Math.floor(l.w / 3) }, (_, k) => (
                <path key={k} d={`M${l.x + (k + 1) * 3} ${l.y}v${l.h}`} />
              ))}
            </g>
          ))}
          {spec.cones.map((c, i) => (
            <path key={`c${i}`} d={`M${c.x} ${c.y - 1}l0.9 1.7h-1.8z`} fill="#fb923c" stroke="#7c2d12" strokeWidth="0.2" />
          ))}
          <ellipse ref={ballShadow} rx="0.9" ry="0.4" fill="#000" opacity="0.3" />
          {motion.bodies.map((b, i) => {
            const c = b.side === 'a' ? colors.a : b.side === 'b' ? colors.b : NEUTRAL
            return (
              <g key={i} ref={(el) => {
                  bodyEls.current[i] = el
                }} transform={`translate(${b.x} ${b.y})`} data-side={b.side}>
                <circle r="2" fill={c.fill} stroke={b.keeper ? '#facc15' : 'rgba(0,0,0,0.55)'} strokeWidth="0.35" />
                <text y="0.8" textAnchor="middle" fontSize="2.4" fontWeight="800" fontFamily="Barlow Condensed, sans-serif" fill={c.ink}>
                  {numberOf(b.side, i)}
                </text>
              </g>
            )
          })}
          <g ref={ballEl} transform={`translate(${motion.ball.x} ${motion.ball.y})`} data-testid="training-ball">
            <circle r="0.95" fill="#fff" stroke="#111" strokeWidth="0.25" />
          </g>
        </svg>
        {scene === 'idle' && (
          <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-bg/80 px-3 py-2 text-center text-xs font-semibold text-slate-200" data-testid="training-idle">
            {caption ?? 'Nenhum exercício montado neste dia: vale o plano da comissão.'}
          </p>
        )}
        {spec.game && (
          <div className="pointer-events-none absolute inset-x-0 top-1.5 flex justify-center" data-testid="training-scoreboard">
            <div className="flex items-center gap-2 rounded-full bg-bg/85 px-3 py-1 text-xs font-extrabold text-white ring-1 ring-white/20">
              <span className="inline-block h-2 w-2 rounded-full ring-1 ring-white/50" style={{ background: colors.a.fill }} aria-hidden="true" />
              <span>Titulares</span>
              <span ref={scoreEl} className="title text-base tabular-nums">
                0 × 0
              </span>
              <span>Reservas</span>
              <span className="inline-block h-2 w-2 rounded-full ring-1 ring-white/50" style={{ background: colors.b.fill }} aria-hidden="true" />
              <span ref={clockEl} className="tabular-nums text-muted">
                0'
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold text-muted">
          {scene === 'idle' ? (
            <b className="text-white">Dia sem treino montado</b>
          ) : (
            <>
              <b className="text-white">{name}</b> · {DRILL_ZONE_LABELS[spec.zone]}
            </>
          )}
        </p>
        <div className="flex gap-1" role="group" aria-label="Velocidade do campinho">
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="min-h-9 rounded-full border border-line bg-surface px-3 text-xs font-bold text-slate-200 active:scale-95" data-testid="training-pause">
            {paused ? 'Continuar' : 'Pausa'}
          </button>
          {SPEEDS.map((s) => (
            <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s} className={`min-h-9 min-w-9 rounded-full border px-2.5 text-xs font-bold active:scale-95 ${speed === s ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}>
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
