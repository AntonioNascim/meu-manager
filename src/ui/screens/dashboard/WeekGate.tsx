import { useState } from 'react'
import { agendaOf, committeeAgenda, weekStatus } from '../../../engine/training'
import type { IsoDate, TrainingSession } from '../../../engine/types'
import { perform } from '../../../store/actions'
import { userTeam, userTrainingPlan } from '../../../store/game'
import type { Game } from '../../../store/game'
import { commandErrorText } from '../../labels'
import type { ScreenId } from '../../navigation'

const dayName = (date: IsoDate) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })

/** Texto dos dias que faltam: "quinta e sexta". */
export function missingText(days: readonly IsoDate[]): string {
  const names = days.map(dayName)
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/** A semana completa (o que o técnico montou mais o que a comissão completa nos dias que faltam). */
export function fullWeek(game: Game): Record<IsoDate, TrainingSession> {
  const team = userTeam(game)
  const { window } = weekStatus(game.season, team.id)
  return { ...committeeAgenda(userTrainingPlan(game), window), ...agendaOf(game.season.training, team.id) }
}

/**
 * Treino obrigatório antes do jogo: enquanto a semana não está montada, o Avançar fica bloqueado. O técnico monta a semana, delega à
 * comissão (só esta semana) ou liga "Delegar sempre". Sem dias de treino até o jogo, nada é pedido.
 */
export function WeekGate({ game, onNavigate, online = false }: { game: Game; onNavigate: (screen: ScreenId, tab?: string) => void; online?: boolean }) {
  const team = userTeam(game)
  const status = weekStatus(game.season, team.id)
  const [message, setMessage] = useState<string | null>(null)
  if (status.ready) return null

  const delegate = () => {
    setMessage(null)
    void perform({ type: 'training-agenda', sessions: fullWeek(game) }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }
  const always = (on: boolean) => {
    setMessage(null)
    void perform({ type: 'training-delegate-always', on }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }

  if (status.delegateAlways) {
    return (
      <div className="mt-3 rounded-[10px] border border-line bg-surface-2/60 p-3 text-sm" data-testid="week-gate-auto">
        <b>{online ? 'A comissão monta a semana ao dar Pronto.' : 'A comissão monta a semana ao avançar.'}</b>
        <p className="mt-1 text-slate-300">Faltam {missingText(status.missing)}. Você ainda pode montar os dias antes.</p>
        <DelegateAlways on onChange={always} />
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-[10px] border border-draw/50 bg-draw/10 p-3 text-sm" data-testid="week-gate">
      <b className="text-draw">{online ? 'Monte a semana de treino antes de dar Pronto.' : 'Monte a semana de treino antes de avançar.'}</b>
      <p className="mt-1 text-slate-200">
        {status.missing.length === 1 ? 'Falta 1 dia' : `Faltam ${status.missing.length} dias`} ({missingText(status.missing)}). Monte você mesmo ou deixe com a comissão.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={() => onNavigate('squad', 'training')} className="min-h-12 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-bold active:scale-95" data-testid="week-gate-build">
          Montar a semana
        </button>
        <button type="button" onClick={delegate} className="min-h-12 flex-1 rounded-xl bg-accent px-3 font-bold text-accent-ink active:scale-95" data-testid="week-gate-delegate">
          Delegar à comissão
        </button>
      </div>
      <DelegateAlways on={status.delegateAlways} onChange={always} />
      {message && <p className="mt-2 text-loss">{message}</p>}
    </div>
  )
}

/** Interruptor "Delegar sempre": a comissão completa as semanas que o técnico não montar. */
export function DelegateAlways({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mt-2.5 flex min-h-11 items-center gap-2 text-slate-300">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-accent" data-testid="delegate-always" />
      <span>
        <b>Delegar sempre</b> <span className="text-muted">· a comissão monta as próximas semanas sozinha (você pode mudar quando quiser)</span>
      </span>
    </label>
  )
}
