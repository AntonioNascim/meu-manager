import { useEffect, useState } from 'react'
import { pendingIncoming } from '../engine/market'
import { academyAlert, lastYearContracts, userTeam } from '../store/game'
import { flushAutosave, useSaveStatus } from '../store/autosave'
import { setGame, useGame } from '../store/gameStore'
import { useBusy } from '../store/heavy'
import { clearLive } from '../store/liveMatch'
import { closeLeague } from '../store/leagueSession'
import { LeagueScreen } from './screens/online/leagues/LeagueScreen'
import { BusyOverlay } from './components/BusyOverlay'
import { TeamBadge } from './components/ui'
import { formatDate } from './format'
import { NAV_TAB_OF, SCREEN_LABELS } from './navigation'
import type { NavTab, ScreenId } from './navigation'
import { BottomNav } from './theme'
import type { NavItem } from './theme'
import { Career } from './screens/Career'
import { Dismissed } from './screens/Dismissed'
import { Market } from './screens/Market'
import type { MarketTab } from './screens/Market'
import { Finance } from './screens/Finance'
import { Dashboard } from './screens/Dashboard'
import { MatchScreen } from './screens/Match'
import { Start } from './screens/Start'
import { Squad } from './screens/Squad'
import type { SquadTab } from './screens/Squad'
import { Standings } from './screens/Standings'
import { Tactics } from './screens/Tactics'

/** Em desenvolvimento, /?tela=squad abre direto numa tela (junto com ?time=). */
function initialScreen(): ScreenId {
  const wanted = import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tela') : null
  return (Object.keys(SCREEN_LABELS) as ScreenId[]).find((id) => id === wanted) ?? 'home'
}

/** Em desenvolvimento, &aba=lineup|numbers abre a aba do Elenco. */
function initialSquadTab(hint?: string): SquadTab {
  const wanted = hint ?? (import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('aba') : null)
  return wanted === 'lineup' || wanted === 'numbers' || wanted === 'academy' || wanted === 'training' ? wanted : 'players'
}

/** Em desenvolvimento, &aba=free|proposals abre a aba do Mercado. */
function initialMarketTab(hint?: string): MarketTab {
  const wanted = hint ?? (import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('aba') : null)
  return wanted === 'favorites' || wanted === 'lists' || wanted === 'free' || wanted === 'precontract' || wanted === 'proposals' || wanted === 'history' || wanted === 'contracts' ? wanted : 'search'
}

/** Em desenvolvimento, &aba=rounds|goals|assists|cards|history abre a seção da Tabela. */
function initialStandingsSection(hint?: string): 'table' | 'rounds' | 'goals' | 'assists' | 'cards' | 'cups' | 'history' {
  const wanted = hint ?? (import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('aba') : null)
  return wanted === 'rounds' || wanted === 'goals' || wanted === 'assists' || wanted === 'cards' || wanted === 'cups' || wanted === 'history' ? wanted : 'table'
}

export function App() {
  const game = useGame()
  const busy = useBusy()
  const saveStatus = useSaveStatus()
  const [screen, setScreen] = useState<ScreenId>(initialScreen)
  // Aba pedida por quem navegou (atalhos e avisos do painel); some ao trocar de tela pela barra de baixo.
  const [hint, setHint] = useState<string | undefined>(undefined)
  // Ação do jogo que ainda não funciona na liga online (as do mercado chegam na próxima parte): avisa em vez de parecer quebrada.
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      setBlocked(true)
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => setBlocked(false), 4000)
    }
    window.addEventListener('mm-online-blocked', on)
    return () => {
      window.removeEventListener('mm-online-blocked', on)
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])
  const navigate = (to: ScreenId, tab?: string) => {
    setHint(tab)
    setScreen(to)
  }
  if (!game) {
    return (
      <Start />
    )
  }

  if (game.dismissal) return <Dismissed game={game} />

  const team = userTeam(game)
  // A tela da partida só existe enquanto o time do jogador tem um jogo por jogar.
  const hasMatch = game.pendingUserMatch !== undefined
  const current: ScreenId = screen === 'match' && !hasMatch ? 'home' : screen
  const tabs: NavItem<NavTab>[] = [
    { id: 'home', label: 'Clube', icon: 'home' },
    { id: 'squad', label: 'Elenco', icon: 'squad', alert: academyAlert(game).pending > 0 || academyAlert(game).arrivals > 0 },
    { id: 'market', label: 'Mercado', icon: 'market', alert: pendingIncoming(game.season).length > 0 || lastYearContracts(game).length > 0 },
    { id: 'standings', label: 'Tabela', icon: 'table' },
    { id: 'finance', label: 'Finanças', icon: 'finance' },
  ]
  const goTab = (tab: NavTab) => navigate(tab)

  return (
    <div className={`mx-auto flex min-h-dvh flex-col bg-bg text-slate-100 ${current === 'match' ? 'max-w-6xl' : 'max-w-xl'}`}>
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
            if (game.online) {
              // A liga é do servidor: sair do jogo só fecha o espelho (nada a salvar neste aparelho).
              clearLive()
              closeLeague()
              return
            }
            void flushAutosave().then(() => {
              clearLive()
              setGame(null)
            })
          }}
        >
          Menu
        </button>
      </header>

      {game.online?.connection === 'offline' && (
        <div className="border-b border-loss/50 bg-loss/10 px-4 py-2 text-xs font-bold text-loss" data-testid="offline-banner" role="status">
          Sem conexão: você vê o último estado da liga e as ações ficam bloqueadas até reconectar.
        </div>
      )}

      {blocked && (
        <div className="border-b border-accent/50 bg-accent/10 px-4 py-2 text-xs font-bold text-accent" data-testid="blocked-banner" role="status">
          Esta ação ainda não está disponível na liga online. Compras, empréstimos e propostas ao vivo chegam na próxima atualização; por enquanto use o Mercado da sala da liga.
        </div>
      )}

      <main className="flex-1 px-4 pb-28 pt-4">
        {current === 'home' && <Dashboard game={game} onNavigate={navigate} />}
        {current === 'league' && game.online && <LeagueScreen leagueId={game.online.leagueId} />}
        {current === 'career' && <Career game={game} onTaken={() => navigate('home')} />}
        {current === 'match' && <MatchScreen game={game} onNavigate={navigate} />}
        {(current === 'squad' || current === 'academy' || current === 'training') && <Squad key={`${current}-${hint ?? ''}`} game={game} initialTab={current === 'academy' ? 'academy' : current === 'training' ? 'training' : initialSquadTab(hint)} />}
        {current === 'tactics' && <Tactics game={game} />}
        {current === 'standings' && <Standings key={hint ?? ''} game={game} initialSection={initialStandingsSection(hint)} />}
        {(current === 'market' || current === 'contracts') && <Market key={`${current}-${hint ?? ''}`} game={game} initialTab={current === 'contracts' ? 'contracts' : initialMarketTab(hint)} />}
        {current === 'finance' && <Finance game={game} />}
      </main>

      <BottomNav items={tabs} active={NAV_TAB_OF[current]} onSelect={goTab} />
      {busy !== null && <BusyOverlay label={busy} />}
    </div>
  )
}
