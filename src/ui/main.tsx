import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { advanceGame, createGame, playPendingAuto, setUserTrainingPlan, squadOf, startUserIndividualTraining } from '../store/game'
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
