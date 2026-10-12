import { useState } from 'react'
import { userTeam } from '../store/game'
import { setGame, useGame } from '../store/gameStore'
import { TeamBadge } from './components/ui'
import { formatDate } from './format'
import { Dashboard } from './screens/Dashboard'
import { NewGame } from './screens/NewGame'

type ScreenId = 'home'

const SCREENS: { id: ScreenId; label: string }[] = [{ id: 'home', label: 'Painel' }]

export function App() {
  const game = useGame()
  const [screen, setScreen] = useState<ScreenId>('home')
  if (!game) return <NewGame />

  const team = userTeam(game)
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-900 text-slate-100">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <TeamBadge team={team} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{team.name}</div>
          <div className="text-xs text-slate-400">{formatDate(game.season.season.currentDate)}</div>
        </div>
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
          onClick={() => window.confirm('Voltar para a escolha de time? O progresso atual será perdido.') && setGame(null)}
        >
          Novo jogo
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{screen === 'home' && <Dashboard game={game} />}</main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScreen(s.id)}
              className={`min-h-14 flex-1 text-xs font-semibold ${screen === s.id ? 'text-emerald-400' : 'text-slate-400'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
