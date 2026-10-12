import { useState } from 'react'
import { userTeam } from '../store/game'
import { setGame, useGame } from '../store/gameStore'
import { clearLive } from '../store/liveMatch'
import { TeamBadge } from './components/ui'
import { formatDate } from './format'
import { SCREEN_LABELS } from './navigation'
import type { ScreenId } from './navigation'
import { Dashboard } from './screens/Dashboard'
import { MatchScreen } from './screens/Match'
import { NewGame } from './screens/NewGame'
import { Squad } from './screens/Squad'
import { Tactics } from './screens/Tactics'

/** Em desenvolvimento, /?tela=squad abre direto numa tela (junto com ?time=). */
function initialScreen(): ScreenId {
  const wanted = import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tela') : null
  return (Object.keys(SCREEN_LABELS) as ScreenId[]).find((id) => id === wanted) ?? 'home'
}

export function App() {
  const game = useGame()
  const [screen, setScreen] = useState<ScreenId>(initialScreen)
  if (!game) return <NewGame />

  const team = userTeam(game)
  // A aba da partida só existe enquanto o time do jogador tem um jogo por jogar.
  const hasMatch = game.pendingUserMatch !== undefined
  const tabs: ScreenId[] = hasMatch ? ['home', 'match', 'squad', 'tactics'] : ['home', 'squad', 'tactics']
  const current: ScreenId = screen === 'match' && !hasMatch ? 'home' : screen

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <TeamBadge team={team} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{team.name}</div>
          <div className="text-xs text-slate-400">{formatDate(game.season.season.currentDate)}</div>
        </div>
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
          onClick={() => {
            if (window.confirm('Voltar para a escolha de time? O progresso atual será perdido.')) {
              clearLive()
              setGame(null)
            }
          }}
        >
          Novo jogo
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        {current === 'home' && <Dashboard game={game} onNavigate={setScreen} />}
        {current === 'match' && <MatchScreen game={game} onNavigate={setScreen} />}
        {current === 'squad' && <Squad game={game} />}
        {current === 'tactics' && <Tactics game={game} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              className={`min-h-14 flex-1 text-xs font-semibold ${current === id ? 'text-emerald-400' : id === 'match' ? 'text-amber-300' : 'text-slate-400'}`}
            >
              {SCREEN_LABELS[id]}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
