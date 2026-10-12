import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { createGame } from '../store/game'
import { setGame } from '../store/gameStore'

// Atalho de desenvolvimento: /?time=imp&semente=7 já começa o jogo com o time (sigla de 3 letras).
if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search)
  const team = params.get('time')
  if (team) setGame(createGame(Number(params.get('semente') ?? 1), `team-${team.toLowerCase()}`))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
