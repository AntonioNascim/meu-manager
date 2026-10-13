import { useMemo, useState } from 'react'
import { TRAINING } from '../../../engine/config'
import { playerOverall } from '../../../engine/overall'
import { GROUP_ATTRIBUTES, TrainingError, learnablePositions, minutesShareSoFar, potentialRange, projectedGrowth, trainableGroups } from '../../../engine/training'
import { TRAINING_FOCUSES, TRAINING_INTENSITIES } from '../../../engine/types'
import type { IndividualGoal, Position, TrainingFocus, TrainingGroup, TrainingIntensity } from '../../../engine/types'
import { cancelUserIndividualTraining, setUserTrainingPlan, squadOf, startUserIndividualTraining, userFinishedTraining, userIndividualTraining, userTeam, userTrainingPlan } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { PlayerDetail } from '../../components/PlayerDetail'
import { formatDate, playerName } from '../../format'
import {
  ATTRIBUTE_GROUP_LABELS,
  POSITION_LABELS,
  POSITION_SHORT_LABELS,
  TRAINING_FOCUS_DESCRIPTIONS,
  TRAINING_FOCUS_LABELS,
  TRAINING_INTENSITY_LABELS,
  TRAINING_INTENSITY_LEVELS,
} from '../../labels'
import { ConditionBar, Eyebrow, Flag, MoodIcon, Panel, ProgressBar, ValueBadge } from '../../theme'

const goalLabel = (goal: IndividualGoal) => (goal.type === 'group' ? `Atributos ${ATTRIBUTE_GROUP_LABELS[goal.group].toLowerCase()}` : `Aprender a posição ${POSITION_LABELS[goal.position]}`)

/** Cinco quadradinhos acesos até `level` (1 a 5). */
function Pips({ level, tone }: { level: number; tone: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${level} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-[2px] ${i < level ? tone : 'bg-surface-2'}`} />
      ))}
    </span>
  )
}

function Indicator({ label, level, tone }: { label: string; level: number; tone: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] leading-none text-muted">{label}</span>
      <Pips level={level} tone={tone} />
    </div>
  )
}

function IntensityCard({ id, selected, onPick }: { id: TrainingIntensity; selected: boolean; onPick: () => void }) {
  const level = TRAINING_INTENSITY_LEVELS[id]
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border p-3 text-left transition active:scale-95 ${selected ? 'border-accent bg-accent/[0.08]' : 'border-line bg-surface'}`}
    >
      <span className={`title text-2xl ${selected ? 'text-accent' : ''}`}>{TRAINING_INTENSITY_LABELS[id]}</span>
      <span className="flex flex-col gap-2">
        <Indicator label="Evolução" level={level.growth} tone="bg-accent" />
        <Indicator label="Recuperação" level={level.recovery} tone="bg-sky-400" />
        <Indicator label="Risco de lesão" level={level.injury} tone="bg-loss" />
      </span>
    </button>
  )
}

function IndividualSlot({ game, onMessage }: { game: Game; onMessage: (m: string) => void }) {
  const squad = squadOf(game, userTeam(game).id)
  const slot = userIndividualTraining(game)
  const finished = userFinishedTraining(game)
  const [playerId, setPlayerId] = useState('')
  const [kind, setKind] = useState<'group' | 'position'>('group')
  const [group, setGroup] = useState<TrainingGroup>('technical')
  const [position, setPosition] = useState<Position | ''>('')
  const chosen = squad.find((p) => p.id === playerId)
  const positions = chosen ? learnablePositions(chosen) : []
  const groups = chosen ? trainableGroups(chosen) : []
  const trainee = slot ? squad.find((p) => p.id === slot.playerId) : undefined
  const finishedPlayer = finished ? squad.find((p) => p.id === finished.playerId) : undefined

  const start = () => {
    if (!chosen) return
    const goal: IndividualGoal | null = kind === 'group' ? { type: 'group', group: groups.includes(group) ? group : (groups[0] as TrainingGroup) } : position ? { type: 'position', position } : null
    if (!goal) return
    try {
      updateGame((g) => startUserIndividualTraining(g, chosen.id, goal))
      onMessage(`${playerName(chosen)} começou o treino individual.`)
    } catch (e) {
      onMessage(e instanceof TrainingError || e instanceof Error ? e.message : 'Não foi possível iniciar o treino.')
    }
  }

  return (
    <Panel className="p-4">
      <Eyebrow>Treino individual</Eyebrow>
      {slot && trainee ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[trainee.position]}</span>
            <Flag nationality={trainee.nationality} />
            <span className="min-w-0 flex-1 truncate font-bold">{playerName(trainee)}</span>
          </div>
          <p className="text-sm text-slate-300">{goalLabel(slot.goal)}</p>
          <ProgressBar value={((slot.totalDays - slot.daysLeft) / slot.totalDays) * 100} label="Andamento do treino individual" />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Faltam {slot.daysLeft} {slot.daysLeft === 1 ? 'dia' : 'dias'}
            </span>
            <button type="button" onClick={() => updateGame(cancelUserIndividualTraining)} className="min-h-10 rounded-lg px-2 font-bold text-loss">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted">Uma vaga, um jogador por vez, por {TRAINING.individual.days} dias: acelera um grupo de atributos ou ensina uma posição secundária.</p>
          {finished && (
            <p className="rounded-xl border border-accent/40 bg-accent/[0.06] p-3 text-sm" role="status">
              <b>{finishedPlayer ? playerName(finishedPlayer) : 'O jogador'}</b> terminou o treino ({goalLabel(finished.goal).toLowerCase()}) em {formatDate(finished.date)}.
            </p>
          )}
          <select
            aria-label="Jogador do treino individual"
            value={playerId}
            onChange={(e) => {
              setPlayerId(e.target.value)
              setPosition('')
            }}
            className="min-h-11 w-full rounded-xl border border-line bg-surface-2 px-3 font-semibold text-slate-100"
          >
            <option value="">Escolha o jogador</option>
            {squad.map((p) => (
              <option key={p.id} value={p.id}>
                {POSITION_SHORT_LABELS[p.position]} · {playerName(p)} · {p.age} anos · força {Math.round(playerOverall(p))}
              </option>
            ))}
          </select>
          {chosen && (
            <>
              <div className="flex gap-1.5">
                {(['group', 'position'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className={`min-h-10 flex-1 rounded-full border px-3 text-sm font-bold ${kind === k ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}
                  >
                    {k === 'group' ? 'Atributos' : 'Posição nova'}
                  </button>
                ))}
              </div>
              {kind === 'group' ? (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={group === g}
                      onClick={() => setGroup(g)}
                      className={`min-h-10 rounded-full border px-3.5 text-sm font-bold ${group === g ? 'border-sky-300 bg-sky-400/20 text-sky-200' : 'border-line bg-surface text-slate-200'}`}
                    >
                      {ATTRIBUTE_GROUP_LABELS[g]}
                    </button>
                  ))}
                </div>
              ) : positions.length === 0 ? (
                <p className="text-sm text-muted">{chosen.position === 'GK' ? 'Goleiro não aprende posição de linha.' : 'Esse jogador já tem duas posições secundárias.'}</p>
              ) : (
                <select aria-label="Posição a aprender" value={position} onChange={(e) => setPosition(e.target.value as Position)} className="min-h-11 w-full rounded-xl border border-line bg-surface-2 px-3 font-semibold text-slate-100">
                  <option value="">Escolha a posição</option>
                  {positions.map((p) => (
                    <option key={p} value={p}>
                      {POSITION_LABELS[p]}
                    </option>
                  ))}
                </select>
              )}
              {kind === 'group' && <p className="text-xs text-muted">Evolução extra em: {GROUP_ATTRIBUTES[group].length} atributos. O potencial do jogador continua sendo o teto.</p>}
              <button
                type="button"
                onClick={start}
                disabled={kind === 'position' && !position}
                className="min-h-12 w-full rounded-xl bg-accent font-bold text-accent-ink active:scale-95 disabled:opacity-40"
              >
                Iniciar treino de {TRAINING.individual.days} dias
              </button>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

const signed = (v: number) => `+${v.toFixed(1).replace('.', ',')}`

/** Aba Treino: intensidade e foco da semana, vaga individual e a lista de quem mais evolui. */
export function Training({ game }: { game: Game }) {
  const team = userTeam(game)
  const plan = userTrainingPlan(game)
  const squad = squadOf(game, team.id)
  const [message, setMessage] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const date = game.season.season.currentDate
  const rows = useMemo(
    () =>
      squad
        .map((p) => ({ p, growth: projectedGrowth(p, plan, minutesShareSoFar(game.season, p, date)), range: potentialRange(p) }))
        .sort((a, b) => b.growth - a.growth || playerOverall(b.p) - playerOverall(a.p))
        .slice(0, 12),
    [squad, plan, game.season, date],
  )
  const open = squad.find((p) => p.id === openId)
  const setPlan = (next: Partial<{ intensity: TrainingIntensity; focus: TrainingFocus }>) => updateGame((g) => setUserTrainingPlan(g, { ...userTrainingPlan(g), ...next }))

  return (
    <div className="space-y-3">
      <Panel striped cut className="p-4">
        <Eyebrow>Treino da semana</Eyebrow>
        <p className="mt-1 text-sm text-slate-300">A evolução chega aos poucos, a cada semana, e a virada de temporada cuida só do envelhecimento. A base treina junto, em ritmo menor.</p>
      </Panel>

      <div className="flex gap-2">
        {TRAINING_INTENSITIES.map((id) => (
          <IntensityCard key={id} id={id} selected={plan.intensity === id} onPick={() => setPlan({ intensity: id })} />
        ))}
      </div>

      <Panel className="p-4">
        <Eyebrow>Foco</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TRAINING_FOCUSES.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={plan.focus === f}
              onClick={() => setPlan({ focus: f })}
              className={`min-h-10 rounded-full border px-3.5 text-sm font-bold ${plan.focus === f ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}
            >
              {TRAINING_FOCUS_LABELS[f]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">{TRAINING_FOCUS_DESCRIPTIONS[plan.focus]}</p>
      </Panel>

      {message && (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm" role="status">
          {message}
        </p>
      )}
      <IndividualSlot game={game} onMessage={setMessage} />

      <Panel className="overflow-hidden">
        <div className="flex items-baseline justify-between px-4 pt-4">
          <Eyebrow>Quem mais evolui</Eyebrow>
          <span className="text-[11px] text-muted">pontos por temporada</span>
        </div>
        <ul className="mt-2 divide-y divide-line">
          {rows.map(({ p, growth, range }) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className="flex min-h-16 w-full items-center gap-2 px-3 py-2 text-left">
                <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[p.position]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Flag nationality={p.nationality} />
                    <span className="truncate font-bold">{playerName(p)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                    <span className={`font-bold ${growth > 0 ? 'text-accent' : 'text-muted'}`}>{growth > 0 ? `${signed(growth)}/temp.` : 'estável'}</span>
                    <span>
                      · {p.age}a · potencial {range.low}–{range.high}
                    </span>
                  </span>
                </span>
                <MoodIcon morale={p.condition.morale} />
                <ConditionBar fitness={p.condition.fitness} />
                <ValueBadge value={playerOverall(p)}>{Math.round(playerOverall(p))}</ValueBadge>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {open && <PlayerDetail player={open} onClose={() => setOpenId(null)} history={game.season.training.history[open.id]} currentDate={date} />}
    </div>
  )
}
