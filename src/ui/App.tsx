import { useState } from 'react'
import { pendingIncoming } from '../engine/market'
import { lastYearContracts, userTeam } from '../store/game'
import { flushAutosave, useSaveStatus } from '../store/autosave'
import { setGame, useGame } from '../store/gameStore'
import { clearLive } from '../store/liveMatch'
import { TeamBadge } from './components/ui'
import { formatDate } from './format'
import { NAV_TAB_OF, SCREEN_LABELS } from './navigation'
import type { NavTab, ScreenId } from './navigation'
import { BottomNav } from './theme'
import type { NavItem } from './theme'
import { Dismissed } from './screens/Dismissed'
import { Market } from './screens/Market'
import { Finance } from './screens/Finance'
import { Dashboard } from './screens/Dashboard'
import { MatchScreen } from './screens/Match'
import { PwaBanner } from './components/PwaBanner'
import { Start } from './screens/Start'
import { Squad } from './screens/Squad'
import { Standings } from './screens/Standings'
import { Tactics } from './screens/Tactics'

/** Em desenvolvimento, /?tela=squad abre direto numa tela (junto com ?time=). */
function initialScreen(): ScreenId {
  const wanted = import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tela') : null
  return (Object.keys(SCREEN_LABELS) as ScreenId[]).find((id) => id === wanted) ?? 'home'
}

export function App() {
  const game = useGame()
  const saveStatus = useSaveStatus()
  const [screen, setScreen] = useState<ScreenId>(initialScreen)
  if (!game) {
    return (
      <>
        <PwaBanner />
        <Start />
      </>
    )
  }

  if (game.dismissal) return <Dismissed game={game} />

  const team = userTeam(game)
  // A tela da partida só existe enquanto o time do jogador tem um jogo por jogar.
  const hasMatch = game.pendingUserMatch !== undefined
  const current: ScreenId = screen === 'match' && !hasMatch ? 'home' : screen
  const tabs: NavItem<NavTab>[] = [
    { id: 'home', label: 'Clube', icon: 'home' },
    { id: 'squad', label: 'Elenco', icon: 'squad' },
    { id: 'market', label: 'Mercado', icon: 'market', alert: pendingIncoming(game.season).length > 0 || lastYearContracts(game).length > 0 },
    { id: 'standings', label: 'Tabela', icon: 'table' },
    { id: 'finance', label: 'Finanças', icon: 'finance' },
  ]
  const goTab = (tab: NavTab) => setScreen(tab)

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-bg text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
        {current === 'home' ? (
          <div className="min-w-0 flex-1 text-xs text-muted">
            <span className="title text-lg text-white">Meu Manager</span>
            {saveStatus.state === 'saved' && <span className="ml-2 text-win">· salvo</span>}
            {saveStatus.state === 'saving' && <span className="ml-2">· salvando…</span>}
            {saveStatus.state === 'error' && <span className="ml-2 text-loss">· não salvou: {saveStatus.message}</span>}
          </div>
        ) : (
          <>
            <TeamBadge team={team} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="title truncate text-xl">{team.name}</div>
              <div className="text-xs text-muted">
                {formatDate(game.season.season.currentDate)}
                {saveStatus.state === 'saved' && <span className="ml-2 text-win">· salvo</span>}
                {saveStatus.state === 'saving' && <span className="ml-2">· salvando…</span>}
                {saveStatus.state === 'error' && <span className="ml-2 text-loss">· não salvou: {saveStatus.message}</span>}
              </div>
            </div>
          </>
        )}
        <button
          type="button"
          className="min-h-10 rounded-lg px-3 text-xs font-bold uppercase tracking-wider text-muted hover:bg-surface"
          onClick={() => {
            void flushAutosave().then(() => {
              clearLive()
              setGame(null)
            })
          }}
        >
          Menu
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        {current === 'home' && <Dashboard game={game} onNavigate={setScreen} />}
        {current === 'match' && <MatchScreen game={game} onNavigate={setScreen} />}
        {current === 'squad' && <Squad game={game} />}
        {current === 'tactics' && <Tactics game={game} />}
        {current === 'standings' && <Standings game={game} />}
        {(current === 'market' || current === 'contracts') && <Market key={current} game={game} initialTab={current === 'contracts' ? 'contracts' : 'search'} />}
        {current === 'finance' && <Finance game={game} />}
      </main>

      <BottomNav items={tabs} active={NAV_TAB_OF[current]} onSelect={goTab} />
    </div>
  )
}
