import { FINANCE } from '../../engine/config'
import {
  annualSponsorship,
  bestTicketPrice,
  matchAttendance,
  monthlyOperations,
  monthlyPayroll,
  summarizeLedger,
} from '../../engine/finance'
import type { FinanceCategory } from '../../engine/types'
import { squadOf, setUserTicketPrice, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { Button, Card } from '../components/ui'
import { formatDate, formatMoney } from '../format'
import { FINANCE_CATEGORY_LABELS } from '../labels'

const CATEGORY_ORDER: FinanceCategory[] = ['ticket-sales', 'sponsorship', 'player-sales', 'salaries', 'player-purchases', 'severance', 'operations']

const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })

const signed = (value: number) => `${value > 0 ? '+' : ''}${formatMoney(value)}`
const tone = (value: number) => (value < 0 ? 'text-rose-300' : value > 0 ? 'text-emerald-300' : 'text-slate-300')

/** Tela de finanças: saldo, preço do ingresso, fluxo mensal e histórico de lançamentos. */
export function Finance({ game }: { game: Game }) {
  const team = userTeam(game)
  const squad = squadOf(game, team.id)
  const summary = summarizeLedger(team.finances.ledger)
  const typical = { reputation: 10 }
  const attendance = matchAttendance(team, typical)
  const fill = Math.round((100 * attendance) / team.stadium.capacity)
  const best = bestTicketPrice(team)
  const payroll = monthlyPayroll(squad)
  const monthly = Math.round(annualSponsorship(team) / 12) - payroll - monthlyOperations(team)
  const setPrice = (price: number) => {
    const bounded = Math.min(FINANCE.ticket.max, Math.max(FINANCE.ticket.min, price))
    updateGame((g) => setUserTicketPrice(g, bounded))
  }
  const recent = [...team.finances.ledger].reverse().slice(0, 30)
  const months = summary.byMonth.slice(-8)
  const peak = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]))

  return (
    <div className="space-y-3">
      <Card title="Saldo">
        <div className={`text-3xl font-bold tabular-nums ${tone(team.finances.balance)}`}>{formatMoney(team.finances.balance)}</div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Orçamento de transferências</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(team.finances.transferBudget)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Orçamento de salários (mês)</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(team.finances.salaryBudget)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Folha atual (mês)</dt>
            <dd className={`font-semibold tabular-nums ${payroll > team.finances.salaryBudget ? 'text-rose-300' : ''}`}>{formatMoney(payroll)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Resultado fixo do mês</dt>
            <dd className={`font-semibold tabular-nums ${tone(monthly)}`}>{signed(monthly)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-slate-500">
          Fixo do mês = patrocínio − salários − operação. A bilheteria entra a cada jogo em casa.
        </p>
      </Card>

      <Card title="Preço do ingresso">
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" className="w-14" onClick={() => setPrice(team.ticketPrice - 2)} disabled={team.ticketPrice <= FINANCE.ticket.min}>
            −
          </Button>
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">{formatMoney(team.ticketPrice)}</div>
            <div className="text-[11px] text-slate-400">por torcedor</div>
          </div>
          <Button variant="secondary" className="w-14" onClick={() => setPrice(team.ticketPrice + 2)} disabled={team.ticketPrice >= FINANCE.ticket.max}>
            +
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-slate-900/60 p-2">
            <dt className="text-[11px] text-slate-400">Público</dt>
            <dd className="font-semibold tabular-nums">{attendance.toLocaleString('pt-BR')}</dd>
          </div>
          <div className="rounded-lg bg-slate-900/60 p-2">
            <dt className="text-[11px] text-slate-400">Lotação</dt>
            <dd className="font-semibold tabular-nums">{fill}%</dd>
          </div>
          <div className="rounded-lg bg-slate-900/60 p-2">
            <dt className="text-[11px] text-slate-400">Por jogo</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(attendance * team.ticketPrice)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-slate-400">
          Estimativa contra um rival de reputação média, no {team.stadium.name} ({team.stadium.capacity.toLocaleString('pt-BR')} lugares). Preço mais alto rende mais só enquanto o estádio
          fica cheio; o preço que enche o estádio hoje é cerca de <b>{formatMoney(best)}</b>.
          {best !== team.ticketPrice && (
            <button type="button" className="ml-1 font-semibold text-emerald-400 underline" onClick={() => setPrice(best)}>
              Usar
            </button>
          )}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">A lotação também pesa no fator casa: estádio vazio ajuda menos o time.</p>
      </Card>

      <Card title="Temporada até agora">
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-400">Receitas</div>
            <div className="font-semibold tabular-nums text-emerald-300">{formatMoney(summary.income)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Despesas</div>
            <div className="font-semibold tabular-nums text-rose-300">{formatMoney(summary.expenses)}</div>
          </div>
        </div>
        <ul className="divide-y divide-slate-700/60 text-sm">
          {CATEGORY_ORDER.map((c) => (
            <li key={c} className="flex items-center justify-between py-1.5">
              <span>{FINANCE_CATEGORY_LABELS[c]}</span>
              <span className={`tabular-nums ${tone(summary.byCategory[c] ?? 0)}`}>{signed(summary.byCategory[c] ?? 0)}</span>
            </li>
          ))}
        </ul>
        {months.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-400">Por mês (receita em verde, despesa em vermelho)</div>
            <ul className="space-y-1">
              {months.map((m) => (
                <li key={m.month} className="flex items-center gap-2 text-[11px]">
                  <span className="w-12 shrink-0 text-slate-400">{monthLabel(m.month)}</span>
                  <span className="flex-1 space-y-0.5">
                    <span className="block h-1.5 rounded bg-emerald-400" style={{ width: `${(100 * m.income) / peak}%` }} />
                    <span className="block h-1.5 rounded bg-rose-400" style={{ width: `${(100 * m.expenses) / peak}%` }} />
                  </span>
                  <span className={`w-24 shrink-0 text-right tabular-nums ${tone(m.income - m.expenses)}`}>{signed(m.income - m.expenses)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {team.finances.pastSeasons.length > 0 && (
        <Card title="Temporadas anteriores" flush>
          <ul className="divide-y divide-slate-700/60 text-sm">
            {[...team.finances.pastSeasons].reverse().map((s) => (
              <li key={s.year} className="flex items-center justify-between px-3 py-2">
                <span>{s.year}</span>
                <span className={`tabular-nums ${tone(s.income - s.expenses)}`}>{signed(s.income - s.expenses)}</span>
                <span className="tabular-nums text-slate-300">{formatMoney(s.endBalance)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Últimos lançamentos" flush>
        {recent.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-slate-400">Nenhum lançamento ainda. Avance o calendário para ver a primeira bilheteria e a folha do mês.</p>
        ) : (
          <ul className="divide-y divide-slate-700/60 text-sm">
            {recent.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{e.description ?? FINANCE_CATEGORY_LABELS[e.category]}</span>
                  <span className="text-[11px] text-slate-500">
                    {FINANCE_CATEGORY_LABELS[e.category]} · {formatDate(e.date)}
                  </span>
                </span>
                <span className={`tabular-nums ${tone(e.amount)}`}>{signed(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
