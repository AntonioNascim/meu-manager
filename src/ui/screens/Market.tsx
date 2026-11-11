import { useMemo, useState } from 'react'
import { isWindowOpen, pendingIncoming } from '../../engine/market'
import { lastYearContracts } from '../../store/game'
import type { Player } from '../../engine/types'
import type { Game } from '../../store/game'
import { Icon, TopTabs } from '../theme'
import { favoritesOf } from '../../store/game'
import { Contracts } from './Contracts'
import { History } from './market/History'
import { Lists } from './market/Lists'
import { PreContractTab } from './market/PreContract'
import { Proposals } from './market/Proposals'
import { Search } from './market/Search'
import { WindowBanner } from './market/parts'
import { CoachesTab } from './online/leagues/CoachesTab'

export type MarketTab = 'search' | 'favorites' | 'lists' | 'free' | 'precontract' | 'proposals' | 'history' | 'contracts' | 'coaches'

/** Tela de Mercado: abas com rolagem horizontal e o aviso da janela de transferências no topo de todas. */
export function Market({ game, initialTab = 'search' }: { game: Game; initialTab?: MarketTab }) {
  const [tab, setTab] = useState<MarketTab>(initialTab)
  const open = isWindowOpen(game.season)
  const incoming = pendingIncoming(game.season).length
  const favoriteIds = useMemo(() => new Set(favoritesOf(game)), [game])
  const onlyFavorites = useMemo(() => (p: Player) => favoriteIds.has(p.id), [favoriteIds])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Icon name="swap" size={30} className="text-accent" />
        <h2 className="font-display text-[26px] font-bold leading-none">Transferências</h2>
      </div>
      <WindowBanner game={game} />
      <TopTabs
        scroll
        value={tab}
        onChange={setTab}
        options={[
          { id: 'search', label: 'Buscar' },
          { id: 'favorites', label: 'Favoritos' },
          { id: 'lists', label: 'Listas' },
          { id: 'free', label: 'Livres' },
          { id: 'precontract', label: 'Pré-contrato' },
          { id: 'proposals', label: 'Propostas', alert: incoming > 0 },
          { id: 'history', label: 'Histórico' },
          { id: 'contracts', label: 'Contratos', alert: lastYearContracts(game).length > 0 },
          // Só na liga online: negociar com outros técnicos humanos.
          ...(game.online ? [{ id: 'coaches' as const, label: 'Técnicos' }] : []),
        ]}
      />
      {tab === 'search' && <Search key="search" game={game} open={open} />}
      {tab === 'favorites' && <Search key="favorites" game={game} open={open} restrict={onlyFavorites} showTier={false} empty="Toque na estrela de um jogador para acompanhá-lo aqui." />}
      {tab === 'lists' && <Lists game={game} open={open} />}
      {tab === 'free' && <Search key="free" game={game} open={open} preset={{ situation: 'free' }} situations={['free']} showTier={false} empty="Nenhum jogador livre com esses filtros." />}
      {tab === 'precontract' && <PreContractTab game={game} open={open} />}
      {tab === 'proposals' && <Proposals game={game} open={open} />}
      {tab === 'history' && <History game={game} />}
      {tab === 'contracts' && <Contracts game={game} />}
      {tab === 'coaches' && game.online && <CoachesTab leagueId={game.online.leagueId} worldDate={game.season.season.currentDate} />}
    </div>
  )
}
