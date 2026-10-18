import { useMemo, useState } from 'react'
import { OfferError, buyerInterest, isWindowOpen, marketValue, releaseCost } from '../../../engine/market'
import { contractEndIn } from '../../../engine/season'
import type { OfferKind, Player } from '../../../engine/types'
import { releaseUserSquadPlayer, sellUserPlayer } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { formatMoney, playerName } from '../../format'
import { OFFER_REASON_LABELS } from '../../labels'
import { Sheet } from '../../theme'

/** Vender, emprestar ou liberar um jogador do seu elenco (aberto pelo detalhe do jogador no Elenco). */
export function SellSheet({ game, player, onClose, onDone }: { game: Game; player: Player; onClose: () => void; onDone: () => void }) {
  const state = game.season
  const [kind, setKind] = useState<OfferKind>('purchase')
  const [buyerId, setBuyerId] = useState<string | null>(null)
  const open = isWindowOpen(state, state.season.currentDate, [game.userTeamId, buyerId])
  const [fee, setFee] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const buyers = useMemo(
    () =>
      state.teams
        .filter((t) => t.id !== game.userTeamId)
        .map((t) => ({ team: t, interest: buyerInterest(state, t.id, player, kind) }))
        .filter((b) => b.interest.maxFee !== null && b.interest.maxFee > 0)
        .sort((a, b) => (b.interest.maxFee ?? 0) - (a.interest.maxFee ?? 0)),
    [state, game.userTeamId, player, kind],
  )
  const chosen = buyers.find((b) => b.team.id === buyerId)
  const value = fee ?? chosen?.interest.maxFee ?? 0
  const date = state.season.currentDate

  const sell = () => {
    if (!chosen) return
    try {
      const contractEnd = contractEndIn(state, chosen.team.id, kind === 'loan' ? 0 : 3)
      const { game: next, result } = sellUserPlayer(game, { playerId: player.id, buyerId: chosen.team.id, kind, fee: value, contractEnd })
      if (result.accepted) {
        updateGame(() => next)
        onDone()
      } else {
        const reason = result.reason ? OFFER_REASON_LABELS[result.reason] : 'Proposta recusada.'
        setMessage(result.counter !== undefined ? `${reason} Máximo: ${formatMoney(result.counter)}.` : reason)
      }
    } catch (e) {
      setMessage(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível concluir.')
    }
  }

  const release = () => {
    if (!window.confirm(`Liberar ${playerName(player)}? Rescisão de ${formatMoney(releaseCost(player, date))}.`)) return
    try {
      updateGame((g) => releaseUserSquadPlayer(g, player.id))
      onDone()
    } catch (e) {
      setMessage(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível liberar.')
    }
  }

  const input = 'mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold'
  return (
    <Sheet
      title="Negociar jogador"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {!open && <p className="text-sm text-amber-300">Janela fechada: só é possível liberar o jogador.</p>}
          {message && <p className="text-sm text-loss">{message}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={!open || !chosen} onClick={sell} className="min-h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink active:scale-95 disabled:opacity-40">
              {kind === 'loan' ? 'Emprestar' : 'Vender'}
            </button>
            <button type="button" onClick={release} className="min-h-12 rounded-xl border border-loss/60 px-5 font-bold text-loss active:scale-95">
              Liberar
            </button>
          </div>
        </div>
      }
    >
      <p className="text-sm text-muted">
        {playerName(player)} · valor de mercado {formatMoney(marketValue(player, date, state.teams.find((t) => t.id === game.userTeamId)))} · salário {formatMoney(player.contract.salary)}
      </p>
      <div className="mt-3 flex gap-2">
        {(['purchase', 'loan'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              setBuyerId(null)
              setFee(null)
            }}
            className={`min-h-11 flex-1 rounded-full border font-bold ${kind === k ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}
          >
            {k === 'purchase' ? 'Vender' : 'Emprestar'}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm">
        Clube interessado
        <select
          className={input}
          value={buyerId ?? ''}
          onChange={(e) => {
            setBuyerId(e.target.value || null)
            setFee(null)
          }}
        >
          <option value="">{buyers.length ? 'Escolha um clube' : 'Nenhum clube interessado'}</option>
          {buyers.map((b) => (
            <option key={b.team.id} value={b.team.id}>
              {b.team.name} · até {formatMoney(b.interest.maxFee as number)}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <label className="mt-3 block text-sm">
          {kind === 'loan' ? 'Taxa do empréstimo' : 'Valor da venda'}
          <input type="number" min={0} step={10_000} className={input} value={value} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
      )}
    </Sheet>
  )
}
