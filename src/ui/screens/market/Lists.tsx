import { useMemo, useState } from 'react'
import { listingOf, listingPrice, marketValue } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import type { ListingKind, Player } from '../../../engine/types'
import { listUserSquadPlayer, squadOf, unlistUserSquadPlayer } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { playerName } from '../../format'
import { formatMoney } from '../../format'
import { POSITION_SHORT_LABELS } from '../../labels'
import { Flag, Panel, Sheet, TopTabs, ValueBadge } from '../../theme'
import { Search } from './Search'
import { shortMoney } from './parts'

type ListTab = 'transfer' | 'loan' | 'mine'

const KIND_LABELS: Record<ListingKind, string> = { transfer: 'À venda', loan: 'Para empréstimo' }

function ListSheet({ game, player, onClose }: { game: Game; player: Player; onClose: () => void }) {
  const date = game.season.season.currentDate
  const current = game.season.market.listings.find((l) => l.playerId === player.id && l.by === 'user')
  const [kind, setKind] = useState<ListingKind>(current?.kind ?? 'transfer')
  const [price, setPrice] = useState<number>(current?.price ?? listingPrice(player, current?.kind ?? 'transfer', date))
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    try {
      updateGame((g) => listUserSquadPlayer(g, player.id, kind, price))
      onClose()
    } catch {
      setError('Informe um preço válido.')
    }
  }
  return (
    <Sheet
      title="Anunciar jogador"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="min-h-12 flex-1 rounded-xl bg-accent font-bold text-accent-ink active:scale-95">
              {current ? 'Atualizar anúncio' : 'Anunciar'}
            </button>
            {current && (
              <button
                type="button"
                onClick={() => {
                  updateGame((g) => unlistUserSquadPlayer(g, player.id))
                  onClose()
                }}
                className="min-h-12 rounded-xl border border-loss/60 px-5 font-bold text-loss active:scale-95"
              >
                Remover
              </button>
            )}
          </div>
        </div>
      }
    >
      <p className="text-sm text-muted">
        {playerName(player)} · valor de mercado {formatMoney(marketValue(player, date))}. Anunciado, ele atrai mais propostas dos clubes, pelo preço que você fixar.
      </p>
      <div className="mt-3 flex gap-2">
        {(['transfer', 'loan'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              setPrice(listingPrice(player, k, date))
            }}
            className={`min-h-11 flex-1 rounded-full border font-bold ${kind === k ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-200'}`}
          >
            {k === 'transfer' ? 'Venda' : 'Empréstimo'}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm">
        {kind === 'loan' ? 'Taxa do empréstimo' : 'Preço da venda'}
        <input type="number" min={0} step={10_000} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      </label>
    </Sheet>
  )
}

/** Seus jogadores: quais estão anunciados e a janela para anunciar ou retirar. */
function Mine({ game }: { game: Game }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const squad = squadOf(game, game.userTeamId)
    .filter((p) => !p.contract.loanedFrom)
    .sort((a, b) => playerOverall(b) - playerOverall(a))
  const picked = squad.find((p) => p.id === pickedId)
  const date = game.season.season.currentDate
  return (
    <div className="space-y-3">
      <Panel className="p-4 text-sm text-slate-300">Anuncie jogadores seus para venda ou empréstimo: os clubes passam a fazer propostas por eles, pelo preço anunciado. As propostas chegam em Propostas, durante as janelas.</Panel>
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {squad.map((p) => {
            const listing = game.season.market.listings.find((l) => l.playerId === p.id && l.by === 'user')
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setPickedId(p.id)} className="flex min-h-16 w-full items-center gap-2 px-3 py-2 text-left">
                  <span className="w-8 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[p.position]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <Flag nationality={p.nationality} />
                      <span className="truncate font-bold">{playerName(p)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {p.age} anos · valor {shortMoney(marketValue(p, date))}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {listing ? (
                      <>
                        <span className="block font-bold text-accent">{KIND_LABELS[listing.kind]}</span>
                        <span className="block text-muted">{shortMoney(listing.price)}</span>
                      </>
                    ) : (
                      <span className="text-muted">anunciar ›</span>
                    )}
                  </span>
                  <ValueBadge value={playerOverall(p)}>{Math.round(playerOverall(p))}</ValueBadge>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>
      {picked && <ListSheet key={picked.id} game={game} player={picked} onClose={() => setPickedId(null)} />}
    </div>
  )
}

/** Listas: jogadores que os clubes colocaram à venda ou para empréstimo (mais baratos que o normal) e os seus anúncios. */
export function Lists({ game, open }: { game: Game; open: boolean }) {
  const [tab, setTab] = useState<ListTab>('transfer')
  const listings = game.season.market.listings
  const ids = useMemo(() => new Set(listings.filter((l) => l.by === 'ai' && l.kind === tab).map((l) => l.playerId)), [listings, tab])
  const restrict = useMemo(() => (p: Player) => ids.has(p.id), [ids])
  const kind = tab === 'loan' ? 'loan' : 'purchase'

  return (
    <div className="space-y-3">
      <TopTabs
        value={tab}
        onChange={setTab}
        options={[
          { id: 'transfer', label: 'Transferência' },
          { id: 'loan', label: 'Empréstimo' },
          { id: 'mine', label: 'Meus' },
        ]}
      />
      {tab === 'mine' ? (
        <Mine game={game} />
      ) : (
        <Search
          key={tab}
          game={game}
          open={open}
          restrict={restrict}
          showTier={false}
          initialKind={kind}
          trailing={(p) => {
            const l = listingOf(game.season, p.id, kind)
            return (
              <>
                <span className="block text-sm font-extrabold tabular-nums">{l ? shortMoney(l.price) : '–'}</span>
                <span className="block text-[11px] text-muted">negociar ›</span>
              </>
            )
          }}
          header={<Panel className="p-4 text-sm text-slate-300">{tab === 'loan' ? 'Jogadores que os clubes colocaram para empréstimo. Quem está na lista sai mais barato.' : 'Jogadores que os clubes colocaram à venda. Quem está na lista sai mais barato.'}</Panel>}
          empty="Nenhum jogador anunciado agora. Os clubes anunciam quem sobra no elenco a cada rodada de negociações."
        />
      )}
    </div>
  )
}
