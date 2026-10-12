import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { askingPrice, buyerInterest, expectedSalary, isWindowOpen, loanFee, OfferError, pendingIncoming, releaseCost, transferWindows, windowAt } from '../../engine/market'
import { playerOverall } from '../../engine/overall'
import { makeDate } from '../../engine/season/dates'
import { POSITIONS } from '../../engine/types'
import type { OfferKind, Player, Position, TransferOffer } from '../../engine/types'
import { makeUserOffer, releaseUserSquadPlayer, respondToUserOffer, sellUserPlayer, squadOf, teamById, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { Contracts } from './Contracts'
import { Button, Card, Tabs } from '../components/ui'
import { formatDate, formatMoney, playerName } from '../format'
import { OFFER_KIND_LABELS, OFFER_REASON_LABELS, OFFER_STATUS_LABELS, POSITION_SHORT_LABELS, WINDOW_LABELS } from '../labels'

type Tab = 'search' | 'incoming' | 'mine' | 'squad' | 'contracts'

const clubName = (game: Game, id: string | null) => (id ? teamById(game, id).name : 'Livre no mercado')

/** Tela de mercado: busca de jogadores, propostas feitas e propostas recebidas. */
export function Market({ game }: { game: Game }) {
  const [tab, setTab] = useState<Tab>('search')
  const state = game.season
  const open = isWindowOpen(state)
  const window = windowAt(state.season, state.matches, state.season.currentDate)
  const incoming = pendingIncoming(state)
  const nextWindow = transferWindows(state.season, state.matches).find((w) => w.start > state.season.currentDate)

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Mercado</h1>
      <Card>
        {window ? (
          <div className="text-sm">
            <span className="font-semibold text-emerald-300">Janela aberta: {WINDOW_LABELS[window.name]}</span>
            <span className="text-slate-400"> · até {formatDate(window.end)}</span>
          </div>
        ) : (
          <div className="text-sm text-slate-300">
            Janela fechada.{nextWindow ? ` Próxima: ${WINDOW_LABELS[nextWindow.name]}, a partir de ${formatDate(nextWindow.start)}.` : ' Só na próxima temporada.'}
          </div>
        )}
        <div className="mt-1 text-xs text-slate-400">
          Orçamento de transferências: {formatMoney(userTeam(game).finances.transferBudget)} · Elenco: {squadOf(game, game.userTeamId).length}
        </div>
      </Card>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'search', label: 'Buscar' },
          { id: 'incoming', label: `Recebidas${incoming.length ? ` (${incoming.length})` : ''}` },
          { id: 'mine', label: 'Minhas' },
          { id: 'squad', label: 'Meu elenco' },
          { id: 'contracts', label: 'Contratos' },
        ]}
      />
      {tab === 'search' && <Search game={game} open={open} />}
      {tab === 'incoming' && <Incoming game={game} open={open} />}
      {tab === 'mine' && <Mine game={game} />}
      {tab === 'squad' && <MySquad game={game} open={open} />}
      {tab === 'contracts' && <Contracts game={game} />}
    </div>
  )
}

function Search({ game, open }: { game: Game; open: boolean }) {
  const [position, setPosition] = useState<Position | 'all'>('all')
  const [freeOnly, setFreeOnly] = useState(false)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const date = game.season.season.currentDate
  const list = useMemo(
    () =>
      game.season.players
        .filter((p) => p.teamId !== game.userTeamId && !p.contract.loanedFrom && (position === 'all' || p.position === position) && (!freeOnly || p.teamId === null))
        .sort((a, b) => playerOverall(b) - playerOverall(a))
        .slice(0, 40),
    [game.season.players, game.userTeamId, position, freeOnly],
  )
  const picked = game.season.players.find((p) => p.id === pickedId)
  if (picked) return <OfferForm game={game} player={picked} open={open} onClose={() => setPickedId(null)} />

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className="min-h-12 flex-1 rounded-xl bg-slate-800 px-3" value={position} onChange={(e) => setPosition(e.target.value as Position | 'all')}>
          <option value="all">Todas as posições</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{POSITION_SHORT_LABELS[p]}</option>
          ))}
        </select>
        <label className="flex min-h-12 items-center gap-2 rounded-xl bg-slate-800 px-3 text-sm">
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Livres
        </label>
      </div>
      <Card flush>
        <ul className="divide-y divide-slate-700">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className="flex min-h-14 w-full items-center gap-2 px-3 text-left" onClick={() => setPickedId(p.id)}>
                <span className="w-9 text-xs text-slate-400">{POSITION_SHORT_LABELS[p.position]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{playerName(p)}</span>
                  <span className="block truncate text-xs text-slate-400">{p.age} anos · {clubName(game, p.teamId)}</span>
                </span>
                <span className="w-9 text-right font-semibold">{Math.round(playerOverall(p))}</span>
                <span className="w-24 text-right text-xs text-slate-300">
                  {p.teamId ? formatMoney(askingPrice(p, squadOf(game, p.teamId), date)) : 'Grátis'}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="p-4 text-sm text-slate-400">Nenhum jogador encontrado.</li>}
        </ul>
      </Card>
    </div>
  )
}

function OfferForm({ game, player, open, onClose }: { game: Game; player: Player; open: boolean; onClose: () => void }) {
  const date = game.season.season.currentDate
  const free = player.teamId === null
  const [kind, setKind] = useState<OfferKind>('purchase')
  const price = free ? 0 : kind === 'loan' ? loanFee(player, date) : askingPrice(player, squadOf(game, player.teamId as string), date)
  const [fee, setFee] = useState<number | null>(null)
  const [salary, setSalary] = useState(expectedSalary(player))
  const [years, setYears] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const value = fee ?? price
  const year = game.season.season.year

  const submit = () => {
    try {
      const contractEnd = makeDate(kind === 'loan' ? year : year + years, 12, 31)
      updateGame((g) => makeUserOffer(g, { kind, playerId: player.id, fee: value, salary, contractEnd }))
      onClose()
    } catch (e) {
      setError(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível enviar a proposta.')
    }
  }

  return (
    <Card title="Fazer proposta">
      <div className="mb-3">
        <div className="font-semibold">{playerName(player)}</div>
        <div className="text-xs text-slate-400">
          {POSITION_SHORT_LABELS[player.position]} · {player.age} anos · força {Math.round(playerOverall(player))} · {clubName(game, player.teamId)}
        </div>
      </div>
      {!free && (
        <div className="mb-3 flex gap-2">
          {(['purchase', 'loan'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                setFee(null)
              }}
              className={`min-h-12 flex-1 rounded-xl text-sm font-semibold ${kind === k ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700'}`}
            >
              {OFFER_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {!free && (
        <label className="mb-3 block text-sm">
          {kind === 'loan' ? 'Taxa do empréstimo' : 'Valor da compra'} (pedido: {formatMoney(price)})
          <input type="number" min={0} step={10_000} className="mt-1 min-h-12 w-full rounded-xl bg-slate-900 px-3" value={value} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
      )}
      <label className="mb-3 block text-sm">
        Salário mensal (esperado: {formatMoney(expectedSalary(player))})
        <input type="number" min={0} step={500} className="mt-1 min-h-12 w-full rounded-xl bg-slate-900 px-3" value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
      </label>
      {kind === 'purchase' && (
        <label className="mb-3 block text-sm">
          Duração do contrato
          <select className="mt-1 min-h-12 w-full rounded-xl bg-slate-900 px-3" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>{y} {y === 1 ? 'ano' : 'anos'}</option>
            ))}
          </select>
        </label>
      )}
      {!open && <p className="mb-2 text-sm text-amber-300">A janela de transferências está fechada.</p>}
      {error && <p className="mb-2 text-sm text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!open} onClick={submit}>Enviar proposta</Button>
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
      </div>
    </Card>
  )
}

function OfferRow({ game, offer, children }: { game: Game; offer: TransferOffer; children?: ReactNode }) {
  const player = game.season.players.find((p) => p.id === offer.playerId)
  const other = offer.direction === 'incoming' ? offer.buyerId : offer.sellerId
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{player ? playerName(player) : offer.playerId}</span>
        <span className="text-xs text-slate-400">{OFFER_KIND_LABELS[offer.kind]}</span>
      </div>
      <div className="text-xs text-slate-300">
        {offer.direction === 'incoming' ? `Proposta do ${clubName(game, other)}` : `Para o ${clubName(game, other)}`} · {formatMoney(offer.fee)} · salário {formatMoney(offer.salary)}
      </div>
      <div className="text-xs text-slate-400">
        {OFFER_STATUS_LABELS[offer.status]}
        {offer.status === 'pending' && ` · resposta até ${formatDate(offer.dueOn)}`}
        {offer.reason && ` · ${OFFER_REASON_LABELS[offer.reason]}`}
        {offer.counter !== undefined && offer.status === 'rejected' && ` · mínimo aceito: ${formatMoney(offer.counter)}`}
      </div>
      {children}
    </li>
  )
}

function Incoming({ game, open }: { game: Game; open: boolean }) {
  const pending = pendingIncoming(game.season)
  const [error, setError] = useState<string | null>(null)
  const answer = (id: string, accept: boolean) => {
    try {
      updateGame((g) => respondToUserOffer(g, id, accept))
      setError(null)
    } catch (e) {
      setError(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível responder.')
    }
  }
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <Card flush>
        <ul className="divide-y divide-slate-700">
          {pending.map((o) => (
            <OfferRow key={o.id} game={game} offer={o}>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={!open} onClick={() => answer(o.id, true)}>Aceitar</Button>
                <Button className="flex-1" variant="secondary" onClick={() => answer(o.id, false)}>Recusar</Button>
              </div>
            </OfferRow>
          ))}
          {pending.length === 0 && <li className="p-4 text-sm text-slate-400">Nenhuma proposta recebida.</li>}
        </ul>
      </Card>
    </div>
  )
}

function Mine({ game }: { game: Game }) {
  const offers = game.season.market.offers.filter((o) => o.direction === 'outgoing').slice().reverse()
  return (
    <Card flush>
      <ul className="divide-y divide-slate-700">
        {offers.map((o) => (
          <OfferRow key={o.id} game={game} offer={o} />
        ))}
        {offers.length === 0 && <li className="p-4 text-sm text-slate-400">Você ainda não fez propostas.</li>}
      </ul>
    </Card>
  )
}

/** Vender, emprestar ou liberar jogadores do próprio time. */
function MySquad({ game, open }: { game: Game; open: boolean }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const squad = squadOf(game, game.userTeamId)
    .filter((p) => !p.contract.loanedFrom)
    .sort((a, b) => playerOverall(b) - playerOverall(a))
  const picked = squad.find((p) => p.id === pickedId)
  if (picked) return <SellForm game={game} player={picked} open={open} onClose={() => setPickedId(null)} />
  return (
    <Card flush>
      <ul className="divide-y divide-slate-700">
        {squad.map((p) => (
          <li key={p.id}>
            <button type="button" className="flex min-h-14 w-full items-center gap-2 px-3 text-left" onClick={() => setPickedId(p.id)}>
              <span className="w-9 text-xs text-slate-400">{POSITION_SHORT_LABELS[p.position]}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{playerName(p)}</span>
              <span className="text-xs text-slate-400">{p.age} anos</span>
              <span className="w-9 text-right font-semibold">{Math.round(playerOverall(p))}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function SellForm({ game, player, open, onClose }: { game: Game; player: Player; open: boolean; onClose: () => void }) {
  const state = game.season
  const year = state.season.year
  const [kind, setKind] = useState<OfferKind>('purchase')
  const [buyerId, setBuyerId] = useState<string | null>(null)
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
      const contractEnd = makeDate(kind === 'loan' ? year : year + 3, 12, 31)
      const { game: next, result } = sellUserPlayer(game, { playerId: player.id, buyerId: chosen.team.id, kind, fee: value, contractEnd })
      if (result.accepted) {
        updateGame(() => next)
        onClose()
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
      onClose()
    } catch (e) {
      setMessage(e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível liberar.')
    }
  }

  return (
    <Card title="Negociar jogador">
      <div className="mb-3">
        <div className="font-semibold">{playerName(player)}</div>
        <div className="text-xs text-slate-400">
          {POSITION_SHORT_LABELS[player.position]} · {player.age} anos · força {Math.round(playerOverall(player))} · salário {formatMoney(player.contract.salary)}
        </div>
      </div>
      <div className="mb-3 flex gap-2">
        {(['purchase', 'loan'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              setBuyerId(null)
              setFee(null)
            }}
            className={`min-h-12 flex-1 rounded-xl text-sm font-semibold ${kind === k ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700'}`}
          >
            {k === 'purchase' ? 'Vender' : 'Emprestar'}
          </button>
        ))}
      </div>
      <label className="mb-3 block text-sm">
        Clube interessado
        <select
          className="mt-1 min-h-12 w-full rounded-xl bg-slate-900 px-3"
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
        <label className="mb-3 block text-sm">
          {kind === 'loan' ? 'Taxa do empréstimo' : 'Valor da venda'}
          <input type="number" min={0} step={10_000} className="mt-1 min-h-12 w-full rounded-xl bg-slate-900 px-3" value={value} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
      )}
      {!open && <p className="mb-2 text-sm text-amber-300">Janela fechada: só é possível liberar o jogador.</p>}
      {message && <p className="mb-2 text-sm text-rose-300">{message}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!open || !chosen} onClick={sell}>{kind === 'loan' ? 'Emprestar' : 'Vender'}</Button>
        <Button variant="secondary" onClick={release}>Liberar</Button>
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
      </div>
    </Card>
  )
}
