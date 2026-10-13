import { useState } from 'react'
import { FINANCE } from '../../../engine/config'
import { budgetTotal, monthlyPayroll, splitLimits } from '../../../engine/finance'
import type { FundsReason, FundsResult } from '../../../engine/finance'
import { requestUserFunds, setUserSalaryBudget, squadOf, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { formatCompactMoney } from '../../format'
import { Eyebrow, Icon, Panel, Sheet } from '../../theme'

const chip = 'inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-2 text-sm font-bold'

/** Barra que divide o orçamento entre salários (por mês) e compras: arrastar para um lado aumenta um e diminui o outro. */
export function BudgetBar({ game }: { game: Game }) {
  const team = userTeam(game)
  const f = team.finances
  const payroll = monthlyPayroll(squadOf(game, team.id))
  const limits = splitLimits(f, payroll)
  const total = budgetTotal(f)
  const maxSalary = Math.floor(total / FINANCE.budget.salaryMonths / 1_000) * 1_000
  const [drag, setDrag] = useState<number | null>(null)
  const clamp = (v: number) => Math.min(limits.maxSalary, Math.max(limits.minSalary, v))
  const salary = clamp(drag ?? f.salaryBudget)
  const purchases = Math.max(0, total - salary * FINANCE.budget.salaryMonths)
  const share = maxSalary > 0 ? Math.min(100, (100 * salary) / maxSalary) : 0
  const commit = () => {
    if (drag === null) return
    const value = clamp(drag)
    setDrag(null)
    updateGame((g) => setUserSalaryBudget(g, value))
  }

  return (
    <Panel className="p-4">
      <Eyebrow>Orçamento</Eyebrow>
      <div className="dual-range relative mt-3 h-8">
        <div className="absolute inset-x-0 top-1/2 flex h-4 -translate-y-1/2 overflow-hidden rounded-full bg-surface-2">
          <div className="stripes-fine h-full bg-pink-400/70" style={{ width: `${share}%` }} />
          <div className="h-full flex-1 bg-accent" />
        </div>
        <input
          type="range"
          aria-label="Dividir o orçamento entre salários e compras"
          min={0}
          max={maxSalary}
          step={1_000}
          value={salary}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          onBlur={commit}
          style={{ pointerEvents: 'auto', zIndex: 2 }}
        />
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-sm">
        <div className="font-bold text-pink-300">Salários {formatCompactMoney(salary)}/mês</div>
        <div className="text-right font-bold text-accent">Compras {formatCompactMoney(purchases)}</div>
      </div>
      <p className="mt-1 text-[11px] text-muted">Arraste: o que sobe de um lado desce do outro (um ano de salário vale o mesmo em compras). Os salários não descem abaixo da folha de hoje.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={chip}>
          <Icon name="finance" size={16} /> Folha {formatCompactMoney(payroll)}/mês
        </span>
        <span className={`${chip} ${salary - payroll < 0 ? 'text-loss' : ''}`}>Folga {formatCompactMoney(salary - payroll)}/mês</span>
      </div>
    </Panel>
  )
}

const REASONS: Record<FundsReason, (r: FundsResult) => string> = {
  'window-closed': () => 'A diretoria só libera verba com a janela de transferências aberta.',
  'already-asked': () => 'Você já pediu verba nesta janela. A diretoria libera uma vez por janela.',
  'low-confidence': (r) => `A diretoria só libera verba com confiança de pelo menos ${FINANCE.funds.minConfidence}/100. Hoje ela está em ${Math.round(r.detail.confidence)}/100.`,
  'no-cash': (r) =>
    `O caixa não aguenta liberar mais sem atrasar os salários. A diretoria mantém ${formatCompactMoney(r.detail.reserve)} guardados (${FINANCE.funds.reserveMonths} meses de folha e operação) e o caixa de ${formatCompactMoney(r.detail.balance)} já cobre o orçamento de compras atual.`,
}

/** Texto do resultado de um pedido de verba. */
export function fundsMessage(result: FundsResult, purchases: number): string {
  if (result.granted) {
    return `A diretoria liberou ${formatCompactMoney(result.amount)} para compras, pela confiança de ${Math.round(result.detail.confidence)}/100 e pelo caixa de ${formatCompactMoney(result.detail.balance)}. O orçamento de compras agora é ${formatCompactMoney(purchases)}.`
  }
  return REASONS[result.reason as FundsReason](result)
}

/** Botão "Pedir verba" e a resposta da diretoria numa janela. */
export function FundsButton({ game }: { game: Game }) {
  const [result, setResult] = useState<{ result: FundsResult; purchases: number } | null>(null)
  const [auto, setAuto] = useState(() => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('verba') !== null)
  if (auto) {
    setAuto(false)
    queueMicrotask(() => ask())
  }
  const ask = () => {
    const out = requestUserFunds(game)
    if (out.game !== game) updateGame(() => out.game)
    setResult({ result: out.result, purchases: userTeam(out.game).finances.transferBudget })
  }
  return (
    <>
      <button type="button" onClick={ask} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent font-bold text-accent-ink active:scale-95">
        <Icon name="finance" size={18} /> Pedir verba
      </button>
      {result && (
        <Sheet title={result.result.granted ? 'Verba liberada' : 'Verba recusada'} onClose={() => setResult(null)}>
          <p className={`text-sm ${result.result.granted ? 'text-win' : 'text-slate-200'}`} role="status">
            {fundsMessage(result.result, result.purchases)}
          </p>
        </Sheet>
      )}
    </>
  )
}
