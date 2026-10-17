import { lineupForeignCount } from '../../engine/foreign'
import type { Player, Tactic, Team } from '../../engine/types'

/** Aviso do limite de estrangeiros da liga entre os titulares (só aparece quando a liga define o limite). */
export function ForeignNote({ team, tactic, squad }: { team: Team; tactic: Tactic; squad: readonly Player[] }) {
  const max = team.foreignLimit?.lineup
  if (max === undefined) return null
  const now = lineupForeignCount(tactic, squad, team)
  return (
    <p className={`rounded-lg border p-2 text-sm ${now > max ? 'border-loss/40 bg-loss/10 text-loss' : 'border-line bg-surface text-muted'}`} data-testid="foreign-note">
      Estrangeiros entre os titulares: {now} de no máximo {max} (limite da liga).
    </p>
  )
}
