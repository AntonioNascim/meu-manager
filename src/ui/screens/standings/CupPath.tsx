import { cupPath } from '../../../engine/cups'
import type { Game } from '../../../store/game'

const COLOR = { passed: 'text-win', out: 'text-loss', playing: 'text-accent', bye: 'text-muted' } as const

/** O caminho do seu time numa copa, fase por fase ("Fase de liga · 4º na tabela › Repescagem · passou"). Não aparece se ele não jogou nada ainda. */
export function CupPathLine({ game, cupId, className = '' }: { game: Game; cupId: string; className?: string }) {
  const cup = game.season.cups?.find((c) => c.id === cupId)
  if (!cup) return null
  const steps = cupPath(game.season.matches, cup, game.userTeamId)
  if (steps.length === 0) return null
  return (
    <p className={`text-xs ${className}`} data-testid="cup-path">
      <span className="text-muted">Caminho: </span>
      {steps.map((s, i) => (
        <span key={s.stage + i}>
          {i > 0 && <span className="text-muted"> › </span>}
          <span className="font-semibold">{s.stage}</span> <span className={COLOR[s.state]}>({s.result})</span>
        </span>
      ))}
    </p>
  )
}
