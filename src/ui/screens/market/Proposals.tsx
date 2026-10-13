import { useState } from 'react'
import type { ReactNode } from 'react'
import { OfferError, pendingIncoming } from '../../../engine/market'
import type { TransferOffer } from '../../../engine/types'
import { respondToUserOffer } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { formatDate, formatMoney, playerName } from '../../format'
import { OFFER_KIND_LABELS, OFFER_REASON_LABELS, OFFER_STATUS_LABELS } from '../../labels'
import { Panel, TopTabs } from '../../theme'
import { clubName } from './parts'

const STATUS_COLOR: Record<TransferOffer['status'], string> = {
  pending: 'text-amber-300',
  accepted: 'text-win',
  rejected: 'text-loss',
  withdrawn: 'text-muted',
  expired: 'text-muted',
}

function OfferRow({ game, offer, children }: { game: Game; offer: TransferOffer; children?: ReactNode }) {
  const player = game.season.players.find((p) => p.id === offer.playerId)
  const incoming = offer.direction === 'incoming'
  const other = incoming ? offer.buyerId : offer.sellerId
  return (
    <li className="space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-extrabold">{player ? playerName(player) : offer.playerId}</span>
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-bold text-muted">{OFFER_KIND_LABELS[offer.kind]}</span>
      </div>
      <div className="text-sm text-slate-300">
        {incoming ? `Proposta do ${clubName(game, other)}` : `Para o ${clubName(game, other)}`} · {offer.fee > 0 ? formatMoney(offer.fee) : 'sem custo'} · salário {formatMoney(offer.salary)}
      </div>
      <div className="text-xs text-muted">
        <span className={`font-bold ${STATUS_COLOR[offer.status]}`}>{OFFER_STATUS_LABELS[offer.status]}</span>
        {offer.status === 'pending' && ` · resposta até ${formatDate(offer.dueOn)}`}
        {offer.reason && ` · ${OFFER_REASON_LABELS[offer.reason]}`}
        {offer.counter !== undefined && offer.status === 'rejected' && ` · mínimo aceito: ${formatMoney(offer.counter)}`}
      </div>
      {children}
    </li>
  )
}

/** Propostas recebidas (aceitar ou recusar) e enviadas (acompanhar a resposta). */
export function Proposals({ game, open }: { game: Game; open: boolean }) {
  const received = pendingIncoming(game.season)
  const [tab, setTab] = useState<'received' | 'sent'>(received.length > 0 ? 'received' : 'sent')
  const [error, setError] = useState<string | null>(null)
  const sent = game.season.market.offers.filter((o) => o.direction === 'outgoing').slice().reverse()
  const past = game.season.market.offers.filter((o) => o.direction === 'incoming' && o.status !== 'pending').slice().reverse()
  const answer = (id: string, accept: boolean) => {
    try {
      updateGame((g) => respondToUserOffer(g, id, accept))
      setError(null)
    } catch (e) {
      setError(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível responder.')
    }
  }

  return (
    <div className="space-y-3">
      <TopTabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'received', label: `Recebidas${received.length ? ` (${received.length})` : ''}`, alert: received.length > 0 },
          { id: 'sent', label: 'Enviadas' },
        ]}
      />
      {error && <p className="text-sm text-loss">{error}</p>}
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {tab === 'received' &&
            received.map((o) => (
              <OfferRow key={o.id} game={game} offer={o}>
                <div className="flex gap-2">
                  <button type="button" disabled={!open} onClick={() => answer(o.id, true)} className="min-h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink active:scale-95 disabled:opacity-40">
                    Aceitar
                  </button>
                  <button type="button" onClick={() => answer(o.id, false)} className="min-h-12 flex-1 rounded-xl border border-line bg-surface-2 font-bold active:scale-95">
                    Recusar
                  </button>
                </div>
              </OfferRow>
            ))}
          {tab === 'received' && received.length === 0 && <li className="p-4 text-sm text-muted">Nenhuma proposta recebida no momento.</li>}
          {tab === 'received' && past.map((o) => <OfferRow key={o.id} game={game} offer={o} />)}
          {tab === 'sent' && sent.map((o) => <OfferRow key={o.id} game={game} offer={o} />)}
          {tab === 'sent' && sent.length === 0 && <li className="p-4 text-sm text-muted">Você ainda não fez propostas.</li>}
        </ul>
      </Panel>
    </div>
  )
}
