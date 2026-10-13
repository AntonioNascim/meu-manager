import { useMemo, useState } from 'react'
import { isWindowOpen, pendingIncoming } from '../../engine/market'
import { lastYearContracts } from '../../store/game'
import type { Player } from '../../engine/types'
import type { Game } from '../../store/game'
import { TopTabs } from '../theme'
import { favoritesOf } from '../../store/game'
import { Contracts } from './Contracts'
import { History } from './market/History'
import { Lists } from './market/Lists'
import { Proposals } from './market/Proposals'
import { Search } from './market/Search'
import { WindowBanner } from './market/parts'

export type MarketTab = 'search' | 'favorites' | 'lists' | 'free' | 'proposals' | 'history' | 'contracts'

/** Tela de Mercado: abas com rolagem horizontal e o aviso da janela de transferências no topo de todas. */
export function Market({ game, initialTab = 'search' }: { game: Game; initialTab?: MarketTab }) {
  const [tab, setTab] = useState<MarketTab>(initialTab)
  const open = isWindowOpen(game.season)
  const incoming = pendingIncoming(game.season).length
  const favoriteIds = useMemo(() => new Set(favoritesOf(game)), [game])
  const onlyFavorites = useMemo(() => (p: Player) => favoriteIds.has(p.id), [favoriteIds])

  return (
    <div className="space-y-3">
      <TopTabs
        scroll
        value={tab}
        onChange={setTab}
        options={[
          { id: 'search', label: 'Buscar' },
          { id: 'favorites', label: 'Favoritos' },
          { id: 'lists', label: 'Listas' },
          { id: 'free', label: 'Livres' },
          { id: 'proposals', label: 'Propostas', alert: incoming > 0 },
          { id: 'history', label: 'Histórico' },
          { id: 'contracts', label: 'Contratos', alert: lastYearContracts(game).length > 0 },
        ]}
      />
      <WindowBanner game={game} />
      {tab === 'search' && <Search key="search" game={game} open={open} />}
      {tab === 'favorites' && <Search key="favorites" game={game} open={open} restrict={onlyFavorites} showTier={false} empty="Toque na estrela de um jogador para acompanhá-lo aqui." />}
      {tab === 'lists' && <Lists game={game} open={open} />}
      {tab === 'free' && <Search key="free" game={game} open={open} preset={{ situation: 'free' }} situations={['free']} showTier={false} empty="Nenhum jogador livre com esses filtros." />}
      {tab === 'proposals' && <Proposals game={game} open={open} />}
      {tab === 'history' && <History game={game} />}
      {tab === 'contracts' && <Contracts game={game} />}
    </div>
  )
}
