import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Game } from '../../store/game'
import { TeamPage } from '../screens/standings/TeamPage'
import type { LiveTactic } from '../screens/standings/TacticSection'

/**
 * Página do time por cima da tela (usada ao tocar no escudo do adversário no painel e na partida). Com `live`, a seção
 * de tática mostra o que o time tem agora no jogo; como o componente fica dentro da tela da partida, acompanha as mudanças.
 */
export function OpponentOverlay({ game, teamId, live, onClose }: { game: Game; teamId: string; live?: LiveTactic | undefined; onClose: () => void }) {
  const [current, setCurrent] = useState(teamId)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const body = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Página do time" data-testid="team-overlay">
      <div className="mx-auto max-w-xl p-4 pb-16">
        <TeamPage game={game} teamId={current} onBack={() => (current !== teamId ? setCurrent(teamId) : onClose())} onTeam={setCurrent} live={live} />
      </div>
    </div>
  )
  return typeof document === 'undefined' ? body : createPortal(body, document.body)
}
