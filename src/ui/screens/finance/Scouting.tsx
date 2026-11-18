import { useState } from 'react'
import { SCOUT_LEVELS, scoutCost, scoutLevelOf, scoutNextOf } from '../../../engine/scouting'
import type { ScoutLevel } from '../../../engine/types'
import { userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { perform } from '../../../store/actions'
import { formatMoney } from '../../format'
import { SCOUT_EFFECT_LABELS, SCOUT_LEVEL_LABELS, commandErrorText } from '../../labels'
import { Eyebrow, Panel } from '../../theme'

/**
 * Olheiros do clube: nível de 0 a 3, com custo mensal proporcional à receita do clube (pesa parecido para grandes e pequenos). A troca de
 * nível vale a partir do fechamento do mês seguinte, quando o custo também passa a ser cobrado. Vale no solo e na liga online.
 */
export function ScoutingCard({ game }: { game: Game }) {
  const team = userTeam(game)
  const current = scoutLevelOf(team)
  const next = scoutNextOf(team)
  const [message, setMessage] = useState<string | null>(null)
  const choose = (level: ScoutLevel) => {
    setMessage(null)
    void perform({ type: 'scouting', level }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }
  return (
    <Panel className="space-y-3 p-4" data-testid="scouting-card">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Olheiros</Eyebrow>
        <span className="text-xs font-semibold text-muted">
          Em vigor: <b className="text-white">{SCOUT_LEVEL_LABELS[current]}</b> · custo {current === 0 ? 'zero' : `${formatMoney(scoutCost(team, current))}/mês`}
        </span>
      </div>
      <ul className="space-y-1.5" role="radiogroup" aria-label="Nível do olheiro">
        {SCOUT_LEVELS.map((level) => {
          const on = next === level
          return (
            <li key={level}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(level)}
                className={`w-full rounded-xl border p-3 text-left active:scale-[0.99] ${on ? 'border-accent bg-accent/[0.08]' : 'border-line bg-surface'}`}
                data-testid="scout-level"
                data-level={level}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold ${on ? 'text-accent' : ''}`}>{SCOUT_LEVEL_LABELS[level]}</span>
                  <span className="text-xs font-bold tabular-nums text-muted">{level === 0 ? 'sem custo' : `${formatMoney(scoutCost(team, level))}/mês`}</span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-300">{SCOUT_EFFECT_LABELS[level]}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {next !== current && (
        <p className="rounded-lg border border-amber/50 bg-amber/10 p-2 text-xs font-semibold text-amber" role="status" data-testid="scout-pending">
          {SCOUT_LEVEL_LABELS[next]} vale a partir do fechamento do mês que vem, quando o custo passa a ser cobrado.
        </p>
      )}
      {message && (
        <p className="text-sm font-semibold text-loss" role="alert">
          {message}
        </p>
      )}
    </Panel>
  )
}
