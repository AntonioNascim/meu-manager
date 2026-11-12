import { formationOf } from '../../../engine/formations'
import type { Tactic } from '../../../engine/types'
import { gridCoords } from '../../pitchLayout'

/** Campinho com um ponto por titular, na formação do time (decoração do cartão de Tática). */
export function MiniFormation({ tactic, className = '' }: { tactic: Pick<Tactic, 'formationId'> & { grid?: Tactic['grid'] }; className?: string }) {
  const grid = formationOf(tactic).grid
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`rounded-[3px] border border-accent/60 bg-accent/10 ${className}`} aria-hidden="true">
      <path d="M0 50h100M30 0v14h40V0M30 100V86h40v14" fill="none" stroke="rgb(39 224 90 / 0.5)" strokeWidth="2" />
      {grid.map((p, i) => {
        const c = gridCoords(p)
        return <circle key={i} cx={c.x} cy={c.y} r="6" fill="#27e05a" />
      })}
    </svg>
  )
}
