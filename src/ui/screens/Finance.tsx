import { useState } from 'react'
import { averageGate, cashOutlook, monthlyPayroll, summarizeLedger } from '../../engine/finance'
import type { FinanceCategory } from '../../engine/types'
import { boardOf, squadOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { BOARD_STATUS_LABELS, FINANCE_CATEGORY_LABELS } from '../labels'
import { formatCompactMoney, formatDate, formatMoney } from '../format'
import { Eyebrow, Icon, Panel } from '../theme'
import type { IconName } from '../theme'
import { BudgetBar, FundsButton } from './finance/Budget'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, SeasonBalance, Statement, TicketSheet } from './finance/Sheets'

const ICONS: Record<FinanceCategory, IconName> = {
  'ticket-sales': 'stadium',
  sponsorship: 'contract',
  'tv-rights': 'trophy',
  'player-sales': 'swap',
  salaries: 'finance',
  'player-purchases': 'market',
  severance: 'squad',
  operations: 'home',
  'cup-prize': 'trophy',
}

const STATUS_COLOR = { safe: 'text-win', warning: 'text-amber-300', danger: 'text-loss' } as const

/** Tela de Finanças: caixa, alerta de risco, extrato e balanço, estádio e ingresso, folha, até quando o caixa paga e categorias. */
export function Finance({ game }: { game: Game }) {
  const team = userTeam(game)
  const [sheet, setSheet] = useState<'statement' | 'balance' | 'ticket' | null>(() => {
    const wanted = import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('folha') : null
    return wanted === 'extrato' ? 'statement' : wanted === 'balanco' ? 'balance' : wanted === 'ingresso' ? 'ticket' : null
  })
  const squad = squadOf(game, team.id)
  const today = game.season.season.currentDate
  const lastMatch = game.season.matches[game.season.matches.length - 1]
  const outlook = cashOutlook(team, monthlyPayroll(squad), today, lastMatch?.date ?? today)
  const board = boardOf(game)
  const summary = summarizeLedger(team.finances.ledger)
  const gate = averageGate(team.finances.ledger)
  const balance = team.finances.balance

  const tight = outlook.coversSeason && outlook.alerts.includes('payroll')
  const reasons: string[] = []
  if (outlook.alerts.includes('payroll')) {
    reasons.push(`A folha de ${formatCompactMoney(outlook.payroll)} por mês passa dos ${formatCompactMoney(outlook.sustainable)} que a receita do clube sustenta. Venda, empreste ou libere jogadores antes que o caixa aperte.`)
  }
  if (outlook.alerts.includes('debt')) {
    reasons.push(
      balance < 0
        ? `O caixa está negativo em ${formatCompactMoney(-balance)}. A diretoria demite o técnico quando a dívida passar de ${formatCompactMoney(outlook.dismissalDebt)}.`
        : `No ritmo atual o caixa fecha a temporada em ${formatCompactMoney(outlook.projectedEndBalance)}${outlook.coversUntil ? `, deixando de pagar os salários por volta de ${formatDate(outlook.coversUntil)}` : ''}. A diretoria demite o técnico quando a dívida passar de ${formatCompactMoney(outlook.dismissalDebt)}.`,
    )
  }

  return (
    <div className="space-y-3">
      <Panel striped cut className="p-4">
        <Eyebrow>Caixa</Eyebrow>
        <div className={`title mt-1 text-5xl tabular-nums ${balance < 0 ? 'text-loss' : ''}`}>{formatCompactMoney(balance)}</div>
        <div className="mt-1 text-xs text-muted">{formatMoney(balance)}</div>
        <div className={`mt-3 text-sm font-bold ${STATUS_COLOR[board.status]}`}>
          Diretoria: {Math.round(board.confidence)}/100 de confiança · {BOARD_STATUS_LABELS[board.status]}
        </div>
        <div className="mt-3 flex gap-2">
          <FundsButton game={game} />
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => setSheet('statement')} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface font-bold active:scale-95">
            <Icon name="contract" size={18} /> Extrato
          </button>
          <button type="button" onClick={() => setSheet('balance')} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface font-bold active:scale-95">
            <Icon name="table" size={18} /> Balanço
          </button>
        </div>
      </Panel>

      {reasons.length > 0 && (
        <section className="rounded-2xl border border-loss/60 bg-loss/10 p-4" role="alert">
          <div className="flex items-center gap-2 font-bold text-loss">
            <Icon name="finance" size={20} /> Atenção com o caixa
          </div>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" onClick={() => setSheet('ticket')} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left active:scale-[0.99]">
        <span className="text-sky-300">
          <Icon name="stadium" size={28} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold">{team.stadium.name}</span>
          <span className="block text-xs text-muted">
            {team.stadium.capacity.toLocaleString('pt-BR')} lugares · ingresso {formatMoney(team.ticketPrice)} · última renda {gate.last === null ? '–' : formatCompactMoney(gate.last)}
          </span>
        </span>
        <span className="text-xl text-muted" aria-hidden="true">
          ›
        </span>
      </button>

      <BudgetBar game={game} />

      <section
        className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${!outlook.coversSeason ? 'border-loss/50 bg-loss/10 text-loss' : tight ? 'border-amber-300/50 bg-amber-300/10 text-amber-300' : 'border-win/40 bg-win/10 text-win'}`}
        role="status"
      >
        <Icon name="finance" size={20} />
        <p>
          {tight
            ? 'O caixa ainda paga os salários, mas a folha já passou do que a receita sustenta: o resultado do mês fica no limite.'
            : outlook.runwayMonths === null
            ? 'O caixa se sustenta: patrocínio, cota de TV e bilheteria cobrem salários e operação todo mês.'
            : outlook.coversSeason
              ? `O caixa paga os salários até o fim da temporada${outlook.coversUntil ? ` e um pouco além, até ${formatDate(outlook.coversUntil)}` : ''}.`
              : `O caixa paga os salários só até ${formatDate(outlook.coversUntil ?? today)}, antes do fim da temporada.`}
        </p>
      </section>

      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {[...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => {
            const value = summary.byCategory[c] ?? 0
            const income = INCOME_CATEGORIES.includes(c)
            return (
              <li key={c} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className={income ? 'text-win' : 'text-loss'}>
                  <Icon name={ICONS[c]} size={20} />
                </span>
                <span className="flex-1 font-semibold">{FINANCE_CATEGORY_LABELS[c]}</span>
                <span className={`font-extrabold tabular-nums ${income ? 'text-win' : 'text-loss'}`}>
                  {income ? '+' : '−'} {formatMoney(Math.abs(value))}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Totais da temporada até agora.</p>
      </Panel>

      <Panel className="flex items-center gap-3 p-4">
        <span className="text-sky-300">
          <Icon name="stadium" size={22} />
        </span>
        <div className="flex-1">
          <div className="text-xs text-muted">Renda média em casa</div>
          <div className="text-xl font-extrabold tabular-nums">{gate.games > 0 ? formatMoney(gate.average) : '–'}</div>
        </div>
        <div className="text-right text-xs text-muted">{gate.games} {gate.games === 1 ? 'jogo' : 'jogos'} em casa</div>
      </Panel>

      {sheet === 'statement' && <Statement game={game} onClose={() => setSheet(null)} />}
      {sheet === 'balance' && <SeasonBalance game={game} onClose={() => setSheet(null)} />}
      {sheet === 'ticket' && <TicketSheet game={game} onClose={() => setSheet(null)} />}
    </div>
  )
}
