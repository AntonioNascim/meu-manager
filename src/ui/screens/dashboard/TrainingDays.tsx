import { useEffect, useMemo, useRef, useState } from 'react'
import type { IsoDate, TrainingSession } from '../../../engine/types'
import { userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { DRILL_LABELS, REST_LABEL } from '../../labels'
import { teamNumbers } from '../../shirt'
import { inkFor } from '../match/pitchModel'
import { TrainingField } from '../squad/TrainingField'
import type { SceneId } from '../squad/trainingScenes'

const KEY = 'mm-treino-pular'
export function skipPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
function saveSkipPref(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, '1')
    else window.localStorage.removeItem(KEY)
  } catch {
    /* sem armazenamento: vale só agora */
  }
}

const fullDate = (date: IsoDate) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const DAY_MS = [4200, 2100, 1050] as const
const SPEED_LABELS = ['1x', '2x', '4x'] as const

/**
 * O tempo passando dia a dia: o campinho com o treino de cada dia, "Pular a animação" e a escolha de lembrar. É só visual: o avanço do
 * jogo já foi feito pelo motor, com o mesmo resultado com ou sem a animação.
 */
export function TrainingDays({ game, days, sessions, onDone }: { game: Game; days: readonly IsoDate[]; sessions: Readonly<Record<IsoDate, TrainingSession>>; onDone: () => void }) {
  const team = userTeam(game)
  const [index, setIndex] = useState(0)
  const [speed, setSpeed] = useState<0 | 1 | 2>(0)
  const [always, setAlways] = useState(false)
  const alwaysRef = useRef(always)
  alwaysRef.current = always
  const date = days[index]
  const session = date ? sessions[date] : undefined
  const scene: SceneId = session ? (session.drill === 'rest' ? 'rest' : session.drill) : 'idle'
  const numbers = useMemo(() => {
    const byId = teamNumbers(game.season, team.id)
    return team.tactic.startingXI.map((id) => byId.get(id) ?? 0).filter((n) => n > 0)
  }, [game.season, team])
  const colors = useMemo(() => ({ a: { fill: team.colors[0], ink: inkFor(team.colors[0]) }, b: { fill: '#fb923c', ink: '#1c1917' } }), [team.colors])

  const finish = () => {
    saveSkipPref(alwaysRef.current)
    onDone()
  }
  useEffect(() => {
    if (!date) return
    const t = window.setTimeout(() => {
      if (index + 1 >= days.length) {
        saveSkipPref(alwaysRef.current)
        onDone()
      } else setIndex(index + 1)
    }, DAY_MS[speed])
    return () => window.clearTimeout(t)
  }, [index, speed, date, days.length, onDone])

  if (!date) return null
  const drill = session ? (session.drill === 'rest' ? REST_LABEL : DRILL_LABELS[session.drill].name) : 'Plano da comissão'
  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-bg/95 p-4" data-testid="training-days">
      <div>
        <p className="title text-xl">
          Treino · dia {index + 1} de {days.length}
        </p>
        <p className="text-sm capitalize text-muted">{fullDate(date)}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${((index + 1) / days.length) * 100}%` }} />
        </div>
      </div>
      <TrainingField scene={scene} seed={`${team.id}:${date}`} colors={colors} numbersA={numbers} />
      <p className="text-center font-bold">{drill}</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setSpeed(((speed + 1) % 3) as 0 | 1 | 2)} className="min-h-12 flex-1 rounded-xl border border-line bg-surface-2 font-bold" data-testid="training-days-speed">
          {SPEED_LABELS[speed]}
        </button>
        <button type="button" onClick={finish} className="min-h-12 flex-[2] rounded-xl bg-accent font-bold text-accent-ink" data-testid="training-days-skip">
          Pular a animação
        </button>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="size-5 accent-accent" data-testid="training-days-always" />
        Pular sempre (lembrar a escolha)
      </label>
      <p className="text-center text-xs text-muted">O resultado do treino é o mesmo com ou sem a animação.</p>
    </div>
  )
}
