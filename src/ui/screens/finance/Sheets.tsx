import { useState } from 'react'
import { FINANCE } from '../../../engine/config'
import { bestTicketPrice, matchAttendance, summarizeLedger } from '../../../engine/finance'
import type { FinanceCategory } from '../../../engine/types'
import { setUserTicketPrice, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { formatCompactMoney, formatDate, formatMoney } from '../../format'
import { FINANCE_CATEGORY_LABELS } from '../../labels'
import { Sheet } from '../../theme'

export const INCOME_CATEGORIES: FinanceCategory[] = ['ticket-sales', 'sponsorship', 'tv-rights', 'player-sales']
export const EXPENSE_CATEGORIES: FinanceCategory[] = ['salaries', 'player-purchases', 'severance', 'operations']

export const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatMoney(Math.abs(value))}`
export const moneyTone = (value: number) => (value < 0 ? 'text-loss' : value > 0 ? 'text-win' : 'text-muted')

const PAGE = 40

/** Extrato: cada entrada e saída do caixa na temporada, com a data, da mais recente para a mais antiga. */
export function Statement({ game, onClose }: { game: Game; onClose: () => void }) {
  const ledger = userTeam(game).finances.ledger
  const [limit, setLimit] = useState(PAGE)
  const entries = [...ledger].reverse()
  return (
    <Sheet title="Extrato" onClose={onClose}>
      {entries.length === 0 ? (
        <p className="py-4 text-sm text-muted">Nenhum lançamento ainda. Avance o calendário para ver a primeira bilheteria e a folha do mês.</p>
      ) : (
        <ul className="divide-y divide-line">
          {entries.slice(0, limit).map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.description ?? FINANCE_CATEGORY_LABELS[e.category]}</span>
                <span className="text-[11px] text-muted">
                  {FINANCE_CATEGORY_LABELS[e.category]} · {formatDate(e.date)}
                </span>
              </span>
              <span className={`shrink-0 font-bold tabular-nums ${moneyTone(e.amount)}`}>{signedMoney(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {entries.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-surface-2 font-bold">
          Mostrar mais ({entries.length - limit})
        </button>
      )}
      <p className="mt-3 text-[11px] text-muted">O extrato guarda até {FINANCE.ledgerMax} lançamentos da temporada; o saldo não depende deles.</p>
    </Sheet>
  )
}

/** Balanço da temporada: receitas e despesas linha por linha, com a temporada anterior para comparar. */
export function SeasonBalance({ game, onClose }: { game: Game; onClose: () => void }) {
  const team = userTeam(game)
  const now = summarizeLedger(team.finances.ledger)
  const past = team.finances.pastSeasons[team.finances.pastSeasons.length - 1]
  const before = past?.byCategory
  const row = (c: FinanceCategory) => {
    const current = Math.abs(now.byCategory[c] ?? 0)
    const previous = before ? Math.abs(before[c] ?? 0) : null
    return { c, current, previous }
  }
  const header = (label: string) => (
    <li className="flex items-center justify-between bg-surface-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
      <span>{label}</span>
      <span className="flex gap-4">
        <span className="w-24 text-right">{game.season.season.year}</span>
        <span className="w-24 text-right">{past ? past.year : '–'}</span>
      </span>
    </li>
  )
  const line = (r: { c: FinanceCategory; current: number; previous: number | null }, color: string) => (
    <li key={r.c} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate">{FINANCE_CATEGORY_LABELS[r.c]}</span>
      <span className={`w-24 text-right font-bold tabular-nums ${color}`}>{formatCompactMoney(r.current)}</span>
      <span className="w-24 text-right tabular-nums text-muted">{r.previous === null ? '–' : formatCompactMoney(r.previous)}</span>
    </li>
  )
  const result = now.income - now.expenses
  const prevResult = past ? past.income - past.expenses : null
  return (
    <Sheet title="Balanço da temporada" onClose={onClose}>
      <div className="-mx-2 overflow-x-auto">
        <ul className="min-w-[340px] divide-y divide-line">
          {header('Receitas')}
          {INCOME_CATEGORIES.map((c) => line(row(c), 'text-win'))}
          {header('Despesas')}
          {EXPENSE_CATEGORIES.map((c) => line(row(c), 'text-loss'))}
          <li className="flex items-center justify-between gap-2 px-3 py-3 text-sm font-extrabold">
            <span className="flex-1">Resultado</span>
            <span className={`w-24 text-right tabular-nums ${moneyTone(result)}`}>{signedMoney(result)}</span>
            <span className={`w-24 text-right tabular-nums ${prevResult === null ? 'text-muted' : moneyTone(prevResult)}`}>{prevResult === null ? '–' : signedMoney(prevResult)}</span>
          </li>
        </ul>
      </div>
      {!past && <p className="mt-3 text-xs text-muted">A comparação aparece depois da primeira virada de temporada.</p>}
      {past && !before && <p className="mt-3 text-xs text-muted">A temporada anterior foi guardada sem o detalhe por categoria; só o resultado total aparece.</p>}
    </Sheet>
  )
}

/** Controle do ingresso: preço, estimativa de público e renda, e o preço que enche o estádio. */
export function TicketSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const team = userTeam(game)
  const attendance = matchAttendance(team, { reputation: 10 })
  const fill = Math.round((100 * attendance) / team.stadium.capacity)
  const best = bestTicketPrice(team)
  const setPrice = (price: number) => updateGame((g) => setUserTicketPrice(g, Math.min(FINANCE.ticket.max, Math.max(FINANCE.ticket.min, price))))
  const step = 'flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2 text-2xl font-bold active:scale-95 disabled:opacity-40'
  return (
    <Sheet title="Ingresso" onClose={onClose}>
      <div className="flex items-center justify-between gap-2 py-2">
        <button type="button" className={step} aria-label="Baixar o preço" onClick={() => setPrice(team.ticketPrice - 2)} disabled={team.ticketPrice <= FINANCE.ticket.min}>
          −
        </button>
        <div className="text-center">
          <div className="title text-5xl tabular-nums">{formatMoney(team.ticketPrice)}</div>
          <div className="text-[11px] text-muted">por torcedor</div>
        </div>
        <button type="button" className={step} aria-label="Subir o preço" onClick={() => setPrice(team.ticketPrice + 2)} disabled={team.ticketPrice >= FINANCE.ticket.max}>
          +
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
        {[
          ['Público', attendance.toLocaleString('pt-BR')],
          ['Lotação', `${fill}%`],
          ['Renda por jogo', formatMoney(attendance * team.ticketPrice)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-2">
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        Estimativa contra um rival de reputação média, no {team.stadium.name} ({team.stadium.capacity.toLocaleString('pt-BR')} lugares). Preço mais alto rende mais só enquanto o estádio fica cheio; o preço que enche o estádio hoje é cerca de{' '}
        <b className="text-slate-200">{formatMoney(best)}</b>.
        {best !== team.ticketPrice && (
          <button type="button" className="ml-2 font-bold text-accent underline" onClick={() => setPrice(best)}>
            Usar
          </button>
        )}
      </p>
      <p className="mt-2 text-xs text-muted">A lotação também pesa no fator casa: estádio vazio ajuda menos o time.</p>
    </Sheet>
  )
}
