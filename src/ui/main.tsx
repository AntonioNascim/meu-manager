import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { simulateToSeasonEnd } from '../engine/season'
import { advanceGame, createGame, playPendingAuto, startNextSeason, setUserTrainingPlan, squadOf, startUserIndividualTraining } from '../store/game'
import { initPwa } from '../pwa/pwa'
import { startAutosave } from '../store/autosave'
import { setGame } from '../store/gameStore'
import { beginLive } from '../store/liveMatch'

// Atalhos de desenvolvimento (só com `npm run dev`):
//   /?time=imp&semente=7       começa o jogo com o time (sigla de 3 letras)
//   &tela=squad|tactics|match  abre direto numa tela
//   &dias=10                   joga 10 dias de jogos antes (a partida do time é simulada)
//   &jogo=1                    avança até a partida do time
//   &minuto=60                 e deixa a partida ao vivo parada nesse minuto
//   &decidir=1                 três jovens da base do time já com 20 anos (esperando decisão)
//   &anos=2                    simula 2 temporadas inteiras antes (histórico e tabelas passadas)
//   &equipe=team-sol           abre a página do time na Tabela; &resumo=1 abre o resumo de um jogo nas Rodadas
//   &crise=1                  caixa pequeno e folha quatro vezes maior (mostra o alerta das finanças)
//   &treino=intensa|leve       treino coletivo escolhido e a vaga individual ocupada (grupo físico, primeiro jogador de linha)
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search)
  const team = params.get('time')
  if (team) {
    let game = createGame(Number(params.get('semente') ?? 1), `team-${team.toLowerCase()}`)
    for (let i = 0; i < Number(params.get('dias') ?? 0); i++) game = playPendingAuto(advanceGame(game))
    if (params.get('jogo')) {
      while (!game.pendingUserMatch && game.season.matches.some((m) => m.status === 'scheduled')) game = advanceGame(game)
      const minute = params.get('minuto')
      if (minute) beginLive(game).match.playUntil(Number(minute))
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
    setGame(game)
  }
}

startAutosave()
initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
