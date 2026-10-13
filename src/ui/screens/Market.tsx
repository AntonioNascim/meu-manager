import { useState } from 'react'
import { isWindowOpen, pendingIncoming } from '../../engine/market'
import { lastYearContracts } from '../../store/game'
import type { Game } from '../../store/game'
import { TopTabs } from '../theme'
import { Contracts } from './Contracts'
import { Proposals } from './market/Proposals'
import { Search } from './market/Search'
import { WindowBanner } from './market/parts'

export type MarketTab = 'search' | 'free' | 'proposals' | 'contracts'

/** Tela de Mercado: abas com rolagem horizontal e o aviso da janela de transferências no topo de todas. */
export function Market({ game, initialTab = 'search' }: { game: Game; initialTab?: MarketTab }) {
  const [tab, setTab] = useState<MarketTab>(initialTab)
  const open = isWindowOpen(game.season)
  const incoming = pendingIncoming(game.season).length

  return (
    <div className="space-y-3">
      <TopTabs
        scroll
        value={tab}
        onChange={setTab}
        options={[
          { id: 'search', label: 'Buscar' },
          { id: 'free', label: 'Livres' },
          { id: 'proposals', label: 'Propostas', alert: incoming > 0 },
          { id: 'contracts', label: 'Contratos', alert: lastYearContracts(game).length > 0 },
        ]}
      />
      <WindowBanner game={game} />
      {tab === 'search' && <Search key="search" game={game} open={open} />}
      {tab === 'free' && <Search key="free" game={game} open={open} preset={{ situation: 'free' }} situations={['free']} showTier={false} empty="Nenhum jogador livre com esses filtros." />}
      {tab === 'proposals' && <Proposals game={game} open={open} />}
      {tab === 'contracts' && <Contracts game={game} />}
    </div>
  )
}
