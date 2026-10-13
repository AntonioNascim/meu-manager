import { useMemo, useState } from 'react'
import { OfferError, expectedSalary, interestContext, interestIn, listingOf, marketValue, salePrice } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import { makeDate } from '../../../engine/season/dates'
import type { OfferKind, Player } from '../../../engine/types'
import { makeUserOffer, squadOf } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { formatMoney, playerName } from '../../format'
import { OFFER_KIND_LABELS, OFFER_REASON_LABELS, POSITION_LABELS } from '../../labels'
import { Flag, Sheet, ValueBadge } from '../../theme'
import { FavoriteStar, InterestText, clubName } from './parts'

const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
    <span className="text-muted">{label}</span>
    <span className="text-right font-bold">{value}</span>
  </div>
)

/** Negociação numa janela de baixo para cima: compra ou empréstimo, valor, salário e duração. */
export function Negotiation({ game, player, open, onClose, extra, initialKind = 'purchase' }: { game: Game; player: Player; open: boolean; onClose: () => void; extra?: React.ReactNode; initialKind?: OfferKind }) {
  const state = game.season
  const date = state.season.currentDate
  const year = state.season.year
  const free = player.teamId === null
  const [kind, setKind] = useState<OfferKind>(initialKind)
  const [fee, setFee] = useState<number | null>(null)
  const [salary, setSalary] = useState(expectedSalary(player))
  const [years, setYears] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const interest = useMemo(() => interestIn(interestContext(state, game.userTeamId), player, kind), [state, game.userTeamId, player, kind])
  const value = free ? 0 : marketValue(player, date)
  const listing = free ? undefined : listingOf(state, player.id, kind)
  const price = free ? 0 : salePrice(state, player, squadOf(game, player.teamId as string), kind, date)
  const amount = fee ?? price

  const submit = () => {
    try {
      const contractEnd = makeDate(kind === 'loan' ? year : year + years, 12, 31)
      updateGame((g) => makeUserOffer(g, { kind, playerId: player.id, fee: amount, salary, contractEnd }))
      onClose()
    } catch (e) {
      setError(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível enviar a proposta.')
    }
  }

  const input = 'mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold'
  return (
    <Sheet
      title="Negociar"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {!open && <p className="text-sm text-amber-300">A janela de transferências está fechada.</p>}
          {error && <p className="text-sm text-loss">{error}</p>}
          <button type="button" disabled={!open} onClick={submit} className="min-h-12 w-full rounded-xl bg-accent font-bold text-accent-ink active:scale-95 disabled:opacity-40">
            Enviar proposta
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-3 pb-3">
        <ValueBadge value={playerOverall(player)} className="!min-w-14 !px-3 !py-2 !text-3xl">
          {Math.round(playerOverall(player))}
        </ValueBadge>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="truncate text-lg font-extrabold">{playerName(player)}</span>
          </div>
          <div className="text-xs text-muted">
            {POSITION_LABELS[player.position]} · {player.age} anos · {clubName(game, player.teamId)}
          </div>
        </div>
        <FavoriteStar game={game} playerId={player.id} />
      </div>
      <div className="rounded-xl bg-surface-2 px-3 py-2">
        <Line label="Valor de mercado" value={free ? 'Livre, sem custo' : formatMoney(value)} />
        <Line label={kind === 'loan' ? 'Taxa pedida' : 'Preço pedido'} value={free ? 'Grátis' : formatMoney(price)} />
        {listing && <Line label="Na lista do clube" value={<span className="text-accent">{listing.kind === 'loan' ? 'para empréstimo' : 'à venda'}, mais barato</span>} />}
        <Line label="Salário atual" value={formatMoney(player.contract.salary)} />
        <Line label="Interesse em vir" value={<InterestText interest={interest} bare />} />
        {interest.minimumSalary !== null && <Line label="Salário que ele aceitaria" value={`a partir de ${formatMoney(interest.minimumSalary)}`} />}
      </div>
      {extra}
      {!free && (
        <div className="mt-3 flex gap-2">
          {(['purchase', 'loan'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                setFee(null)
              }}
              aria-pressed={kind === k}
              className={`min-h-11 flex-1 rounded-full border font-bold ${kind === k ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}
            >
              {OFFER_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {!free && (
        <label className="mt-3 block text-sm">
          {kind === 'loan' ? 'Taxa do empréstimo' : 'Valor da compra'}
          <input type="number" min={0} step={10_000} className={input} value={amount} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
      )}
      <label className="mt-3 block text-sm">
        Salário mensal
        <input type="number" min={0} step={500} className={input} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
      </label>
      {kind === 'purchase' && (
        <label className="mt-3 block text-sm">
          Duração do contrato
          <select className={input} value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y} {y === 1 ? 'ano' : 'anos'}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'loan' && <p className="mt-3 text-xs text-muted">O empréstimo vai até o fim desta temporada.</p>}
    </Sheet>
  )
}
