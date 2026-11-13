import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { simulateToSeasonEnd } from '../engine/season'
import { advanceGame, createGame, playPendingAuto, setUserTactic, startNextSeason, setUserTrainingPlan, squadOf, startUserIndividualTraining, toggleFavorite, userTeam } from '../store/game'
import type { Mentality, PlayStyle } from '../engine/types'
import { expectedSalary, marketValue } from '../engine/market'
import { playerOverall } from '../engine/overall'
import { contractEndIn } from '../engine/season'
import { initPwa } from '../pwa/pwa'
import { installErrorLog } from './techInfo'
import { startAutosave } from '../store/autosave'
import { flushCloud, loadAccount } from '../store/onlineAccount'
import { getGame, setGame } from '../store/gameStore'
import { perform } from '../store/actions'
import { beginLive } from '../store/liveMatch'
import { loadWorld } from '../data/package/defaultPackage'
import { REAL_PACKAGE_ID, loadRealPackage } from '../data/package/realPackage'
import type { Game } from '../store/game'

// Atalhos de desenvolvimento (só com `npm run dev`):
//   /?time=imp&semente=7       começa o jogo com o time (sigla de 3 letras)
//   &tela=squad|tactics|match  abre direto numa tela
//   &dias=10                   joga 10 dias de jogos antes (a partida do time é simulada)
//   &jogo=1                    avança até a partida do time
//   &minuto=60                 e deixa a partida ao vivo parada nesse minuto
//   &oponente=1                abre a página do adversário (no painel e na partida); &aba=trocas abre as Trocas na partida
//   &iniciar=1                a partida do time já começa rodando (junto com &jogo=1)
//   &ate=gol|cartao|lesao      joga a partida do time até o primeiro gol, cartão ou lesão do time (com &anim=1 o campo mostra o lance)
//   &decidir=1                 três jovens da base do time já com 20 anos (esperando decisão)
//   &anos=2                    simula 2 temporadas inteiras antes (histórico e tabelas passadas)
//   &equipe=team-sol           abre a página do time na Tabela; &resumo=1 abre o resumo de um jogo nas Rodadas
//   &crise=1                  caixa pequeno e folha quatro vezes maior (mostra o alerta das finanças)
//   &mundo=real                começa no mundo real (embutido); aí &time=fla acha o clube pela sigla ou por parte do nome
//   &treino=intensa|leve       treino coletivo escolhido e a vaga individual ocupada (grupo físico, primeiro jogador de linha)
/** Conta online e nuvem (Fase 6, B8): lê a conta do aparelho e envia o que está pendente quando a internet volta ou a aba vai para segundo plano. */
function startOnline() {
  void loadAccount()
  window.addEventListener('online', flushCloud)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCloud()
  })
}

if (import.meta.env.DEV) {
  // Só para os testes de ponta a ponta no navegador (tools/online-lab): lê o jogo que as telas estão mostrando.
  ;(window as unknown as { __mm: { getGame: typeof getGame; perform: typeof perform } }).__mm = { getGame, perform }
  const params = new URLSearchParams(window.location.search)
  const team = params.get('time')
  const startDev = (team: string, real?: Awaited<ReturnType<typeof loadRealPackage>>) => {
    const seed = Number(params.get('semente') ?? 1)
    let game: Game
    if (real) {
      const world = loadWorld(seed, real)
      const wanted = team.toLowerCase()
      const found = world.teams.find((t) => t.abbreviation.toLowerCase() === wanted) ?? world.teams.find((t) => t.name.toLowerCase().includes(wanted))
      if (!found) throw new Error(`Clube não encontrado no mundo real: ${team}`)
      game = createGame(seed, found.id, { world, dataPackage: real, dataPackageId: REAL_PACKAGE_ID })
    } else game = createGame(seed, `team-${team.toLowerCase()}`)
    for (let i = 0; i < Number(params.get('dias') ?? 0); i++) game = playPendingAuto(advanceGame(game))
    // &estilo=wings&mentalidade=2: o seu time joga com esse estilo e mentalidade (para conferir o campo da partida).
    const wantedStyle = params.get('estilo')
    if (wantedStyle) {
      const mine = userTeam(game)
      game = setUserTactic(game, { ...mine.tactic, style: wantedStyle as PlayStyle, mentality: Number(params.get('mentalidade') ?? mine.tactic.mentality) as Mentality })
    }
    if (params.get('jogo')) {
      while (!game.pendingUserMatch && game.season.matches.some((m) => m.status === 'scheduled')) game = advanceGame(game)
      const minute = params.get('minuto')
      const until = params.get('ate')
      if (minute || until) {
        const live = beginLive(game, true)
        if (minute) live.match.playUntil(Number(minute))
        if (Number(minute) === 45) live.halftimeDone = true
        const wanted = (e: { type: string; teamId: string }) => (until === 'gol' ? e.type === 'goal' : until === 'cartao' ? e.type === 'yellow-card' || e.type === 'red-card' : e.type === 'injury' && e.teamId === game.userTeamId)
        for (let m = 1; until && m <= 90 && !live.match.snapshot().injuryPending && !live.match.snapshot().events.some(wanted); m++) live.match.playUntil(m)
      }
    }
    if (params.get('decidir')) {
      let n = 0
      game = { ...game, season: { ...game.season, academy: game.season.academy.map((p) => (p.teamId === game.userTeamId && n++ < 3 ? { ...p, age: 20 } : p)) } }
    }
    if (params.get('crise')) {
      game = { ...game, season: { ...game.season, teams: game.season.teams.map((t) => (t.id === game.userTeamId ? { ...t, finances: { ...t.finances, balance: 2_000_000 } } : t)), players: game.season.players.map((p) => (p.teamId === game.userTeamId ? { ...p, contract: { ...p.contract, salary: p.contract.salary * 4 } } : p)) } }
    }
    if (params.get('anos')) {
      for (let i = 0; i < Number(params.get('anos')); i++) game = startNextSeason({ ...game, season: simulateToSeasonEnd(game.season) })
    }
    const training = params.get('treino')
    if (training) {
      game = setUserTrainingPlan(game, { intensity: training === 'leve' ? 'light' : 'intense', focus: 'technical' })
      const trainee = squadOf(game, game.userTeamId).find((p) => p.position !== 'GK')
      if (trainee) game = startUserIndividualTraining(game, trainee.id, { type: 'group', group: 'physical' })
    }
    if (params.get('mercado')) {
      // Só para as capturas: três jogadores fortes de outros clubes viram favoritos e o primeiro recebe uma proposta.
      const targets = game.season.players.filter((p) => p.teamId !== null && p.teamId !== game.userTeamId).sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 3)
      for (const t of targets) game = toggleFavorite(game, t.id)
      setGame(game)
      const priced = (pl: (typeof targets)[number]) => marketValue(pl, game.season.season.currentDate, game.season.teams.find((t) => t.id === pl.teamId))
      const budget = game.season.teams.find((t) => t.id === game.userTeamId)?.finances.transferBudget ?? 0
      const first = game.season.players.filter((p) => p.teamId !== null && p.teamId !== game.userTeamId && priced(p) < budget * 0.6).sort((x, y) => playerOverall(y) - playerOverall(x))[0]
      if (first) {
        game = toggleFavorite(game, first.id)
        setGame(game)
        const date = game.season.season.currentDate
        const offer = { id: 'dev-offer', direction: 'outgoing' as const, kind: 'purchase' as const, playerId: first.id, buyerId: game.userTeamId, sellerId: first.teamId, fee: priced(first), salary: expectedSalary(first, game.season.teams.find((t) => t.id === game.userTeamId)), contractEnd: contractEndIn(game.season, game.userTeamId, 3), createdOn: date, dueOn: date, status: 'pending' as const }
        game = { ...game, season: { ...game.season, market: { ...game.season.market, offers: [...game.season.market.offers, offer] } } }
        setGame(game)
      }
      return
    }
    setGame(game)
  }
  if (team) {
    if (params.get('mundo') === 'real') void loadRealPackage().then((pkg) => startDev(team, pkg))
    else startDev(team)
  }
}

// Tela escondida de diagnóstico (?diagnostico=1): mede o desempenho no aparelho, sem abrir nem salvar jogos.
const diagnostic = new URLSearchParams(window.location.search).get('diagnostico') === '1'

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('avatares') === '1') {
  void import('./screens/AvatarSheet').then(({ AvatarSheet }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <AvatarSheet />
      </StrictMode>,
    )
  })
} else if (diagnostic) {
  void import('./screens/Diagnostics').then(({ Diagnostics }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Diagnostics />
      </StrictMode>,
    )
  })
} else {
  startAutosave()
  installErrorLog()
  initPwa()
  startOnline()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
