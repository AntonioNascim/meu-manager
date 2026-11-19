import { useMemo, useState } from 'react'
import { DRILLS, agendaOf, committeeAgenda, drillsOf, rehearsal, sessionEffect, trainingWindow, weekStatus } from '../../../engine/training'
import { DRILL_GROUPS, DRILL_THEMES, TRAINING_INTENSITIES } from '../../../engine/types'
import type { DrillGroup, DrillId, IsoDate, TrainingIntensity, TrainingSession } from '../../../engine/types'
import { nextUserMatch, teamById, userTeam, userTrainingPlan } from '../../../store/game'
import type { Game } from '../../../store/game'
import { perform } from '../../../store/actions'
import { DRILL_GROUP_LABELS, DRILL_LABELS, DRILL_THEME_LABELS, DRILL_ZONE_LABELS, REHEARSAL_LABELS, REST_LABEL, TRAINING_INTENSITY_LABELS, commandErrorText } from '../../labels'
import { teamNumbers } from '../../shirt'
import { Eyebrow, Panel } from '../../theme'
import { shortName } from '../standings/parts'
import { inkFor } from '../match/pitchModel'
import { TrainingField } from './TrainingField'
import { DelegateAlways } from '../dashboard/WeekGate'
import { SCENES } from './trainingScenes'
import type { SceneId } from './trainingScenes'

const weekday = (date: IsoDate) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
const dayOfMonth = (date: IsoDate) => date.slice(8, 10).replace(/^0/, '')
const fullDate = (date: IsoDate) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

const riskWord = (v: number) => (v === 0 ? 'nenhum' : v < 0.7 ? 'baixo' : v < 1.3 ? 'médio' : 'alto')
const growthWord = (v: number) => (v < 0.6 ? 'mínima' : v < 0.95 ? 'baixa' : v < 1.15 ? 'normal' : 'alta')
const recoveryWord = (v: number) => (v >= 1.2 ? 'ótima' : v >= 1.03 ? 'boa' : v >= 0.98 ? 'normal' : 'menor')

function Meter({ level }: { level: 0 | 1 | 2 | 3 }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={REHEARSAL_LABELS[level]}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-[2px] ${i <= level ? 'bg-accent' : 'bg-surface-2'}`} />
      ))}
    </span>
  )
}

/**
 * Semana de treino: os dias até o próximo jogo, um exercício e uma intensidade em cada um (ou folga). O que não for montado segue o plano
 * da comissão. A agenda só reparte o ganho que o plano já dá (não soma); os medidores de "o que a semana ensaia" só informam.
 */
export function TrainingWeek({ game }: { game: Game }) {
  const team = userTeam(game)
  const plan = userTrainingPlan(game)
  const window = useMemo(() => trainingWindow(game.season, team.id), [game.season, team.id])
  const agenda = agendaOf(game.season.training, team.id)
  const status = weekStatus(game.season, team.id)
  const [picked, setPicked] = useState<IsoDate | null>(null)
  const [group, setGroup] = useState<DrillGroup>('games')
  const [message, setMessage] = useState<string | null>(null)
  const date = picked && window.includes(picked) ? picked : (window.find((d) => agenda[d] === undefined) ?? window[0])
  const session = date ? agenda[date] : undefined
  const next = nextUserMatch(game)
  const opponent = next ? teamById(game, next.homeTeamId === team.id ? next.awayTeamId : next.homeTeamId) : undefined

  const send = (sessions: Record<string, TrainingSession | null>) => {
    setMessage(null)
    void perform({ type: 'training-agenda', sessions }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }
  const withDay = (d: IsoDate, s: TrainingSession | null): Record<string, TrainingSession | null> => {
    const all: Record<string, TrainingSession | null> = { ...agenda }
    if (s === null) delete all[d]
    else all[d] = s
    return all
  }
  const intensity: TrainingIntensity = session?.intensity ?? plan.intensity
  const chooseDrill = (id: DrillId) => date && send(withDay(date, { drill: id, intensity }))
  const rest = () => date && send(withDay(date, { drill: 'rest', intensity: 'light' }))
  const setIntensity = (i: TrainingIntensity) => date && session && send(withDay(date, { ...session, intensity: i }))

  const sessions = window.flatMap((d) => (agenda[d] ? [agenda[d] as TrainingSession] : []))
  const meters = useMemo(() => rehearsal(sessions), [sessions.map((s) => `${s.drill}:${s.intensity}`).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const numbers = useMemo(() => {
    const byId = teamNumbers(game.season, team.id)
    const starters = team.tactic.startingXI
    const bench = [...game.season.players.filter((p) => p.teamId === team.id && !starters.includes(p.id))].map((p) => p.id)
    const get = (ids: readonly string[]) => ids.map((id) => byId.get(id) ?? 0).filter((n) => n > 0)
    return { a: get(starters), b: get(bench) }
  }, [game.season, team])
  const colors = useMemo(() => ({ a: { fill: team.colors[0], ink: inkFor(team.colors[0]) }, b: { fill: '#fb923c', ink: '#1c1917' } }), [team.colors])
  const scene: SceneId = session ? (session.drill === 'rest' ? 'rest' : session.drill) : 'idle'
  const effect = session ? sessionEffect(session) : undefined
  const sceneLabelId = date ? `${team.id}:${date}` : team.id
  const drillInfo = session && session.drill !== 'rest' ? DRILLS[session.drill] : undefined

  if (window.length === 0) {
    return (
      <Panel className="p-4" data-testid="training-week">
        <Eyebrow>Semana de treino</Eyebrow>
        <p className="mt-2 text-sm text-muted">{next && next.date === game.season.season.currentDate ? 'O jogo é hoje: não há dias de treino até ele. A comissão segue o plano padrão.' : 'Não há jogos à vista: o treino segue o plano padrão.'}</p>
      </Panel>
    )
  }

  return (
    <Panel striped cut className="space-y-3 p-4" data-testid="training-week">
      <div>
        <Eyebrow>Semana de treino</Eyebrow>
        <p className="mt-1 text-sm text-slate-300">
          Até o jogo contra <b>{opponent ? shortName(opponent) : 'o próximo adversário'}</b>
          {next ? ` · ${fullDate(next.date)}` : ''}. Dias sem treino montado seguem o plano da comissão.
        </p>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Dias da semana de treino">
        {window.map((d) => {
          const s = agenda[d]
          const on = d === date
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPicked(d)}
              className={`flex min-h-16 w-[4.6rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-1 text-center active:scale-95 ${on ? 'border-accent bg-accent/[0.1]' : 'border-line bg-surface'}`}
              data-testid="training-day"
              data-date={d}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{weekday(d)}</span>
              <span className="title text-xl leading-none">{dayOfMonth(d)}</span>
              <span className={`line-clamp-2 text-[10px] font-semibold leading-tight ${s ? 'text-accent' : 'text-muted'}`}>{s ? (s.drill === 'rest' ? REST_LABEL : DRILL_LABELS[s.drill].name) : 'Plano'}</span>
            </button>
          )
        })}
      </div>

      <TrainingField scene={scene} seed={sceneLabelId} colors={colors} numbersA={numbers.a} numbersB={numbers.b} />
      {SCENES[scene].zone !== 'circuit' && scene !== 'rest' && drillInfo && <p className="sr-only">{DRILL_ZONE_LABELS[SCENES[scene].zone]}</p>}

      {date && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3" data-testid="training-session">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-sm font-extrabold first-letter:uppercase">{fullDate(date)}</span>
            <span className="text-xs font-semibold text-muted">{session ? (session.drill === 'rest' ? 'Dia de folga' : DRILL_LABELS[session.drill].name) : 'Sem treino montado: vale o plano'}</span>
          </div>
          {session && session.drill !== 'rest' && <p className="text-sm text-slate-300">{DRILL_LABELS[session.drill].description}</p>}
          {session && session.drill === 'rest' && <p className="text-sm text-slate-300">O elenco descansa: recupera mais e não corre risco, mas evolui pouco.</p>}
          {effect && (
            <p className="text-xs text-muted" data-testid="training-effect">
              Evolução <b className="text-white">{growthWord(effect.growth)}</b> · Recuperação <b className="text-white">{recoveryWord(effect.recovery)}</b> · Risco de lesão <b className="text-white">{riskWord(effect.injury)}</b>
            </p>
          )}
          {session && session.drill !== 'rest' && (
            <div className="flex gap-1.5" role="group" aria-label="Intensidade do dia">
              {TRAINING_INTENSITIES.map((i) => (
                <button key={i} type="button" aria-pressed={session.intensity === i} onClick={() => setIntensity(i)} className={`min-h-10 flex-1 rounded-full border px-2 text-sm font-bold active:scale-95 ${session.intensity === i ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface-2 text-slate-200'}`}>
                  {TRAINING_INTENSITY_LABELS[i]}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={rest} className="min-h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold active:scale-95" data-testid="training-rest">
              Dar folga
            </button>
            <button type="button" onClick={() => date && send(withDay(date, null))} disabled={!session} className="min-h-11 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold active:scale-95 disabled:opacity-40" data-testid="training-clear-day">
              Tirar o treino
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Grupos de exercícios">
          {DRILL_GROUPS.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={`min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-bold active:scale-95 ${group === g ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}>
              {DRILL_GROUP_LABELS[g]}
            </button>
          ))}
        </div>
        <ul className="space-y-1.5" data-testid="drill-list">
          {drillsOf(group).map((id) => {
            const on = session?.drill === id
            const info = DRILLS[id]
            return (
              <li key={id}>
                <button type="button" onClick={() => chooseDrill(id)} aria-pressed={on} className={`w-full rounded-xl border p-3 text-left active:scale-[0.99] ${on ? 'border-accent bg-accent/[0.08]' : 'border-line bg-surface'}`} data-testid="drill" data-drill={id}>
                  <span className={`block font-bold ${on ? 'text-accent' : ''}`}>{DRILL_LABELS[id].name}</span>
                  <span className="mt-0.5 block text-xs text-slate-300">{DRILL_LABELS[id].description}</span>
                  <span className="mt-1 block text-[11px] text-muted">
                    {DRILL_ZONE_LABELS[SCENES[id].zone]} · carga {info.load >= 1.15 ? 'alta' : info.load >= 0.7 ? 'média' : 'leve'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => send(committeeAgenda(plan, window))} className="min-h-12 flex-1 rounded-xl bg-accent px-3 font-bold text-accent-ink active:scale-95" data-testid="training-delegate">
          Delegar à comissão
        </button>
        <button type="button" onClick={() => send({})} disabled={sessions.length === 0} className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 font-bold active:scale-95 disabled:opacity-40" data-testid="training-clear">
          Limpar a semana
        </button>
      </div>
      <p className={`text-sm font-semibold ${status.ready ? "text-win" : "text-draw"}`} data-testid="week-status">
        {status.ready ? "Semana pronta: o tempo pode avançar." : `Faltam ${status.missing.length} dia(s) para a semana ficar pronta.`}
      </p>
      <DelegateAlways on={status.delegateAlways} onChange={(on) => void perform({ type: "training-delegate-always", on })} />
      {message && (
        <p className="rounded-xl border border-loss/50 bg-loss/10 p-2.5 text-sm font-semibold text-loss" role="alert">
          {message}
        </p>
      )}

      <div className="rounded-xl border border-line bg-surface p-3" data-testid="training-rehearsal">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">O que a semana ensaia</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {DRILL_THEMES.map((t) => (
            <div key={t} className="flex flex-col gap-1">
              <span className="text-xs font-bold">{DRILL_THEME_LABELS[t]}</span>
              <Meter level={meters[t]} />
              <span className="text-[10px] text-muted">{REHEARSAL_LABELS[meters[t]]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">É só uma leitura do que o time treinou: não muda o resultado dos jogos. O que muda é para onde vai a evolução, a recuperação e o risco de lesão.</p>
      </div>
    </Panel>
  )
}
