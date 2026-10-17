import { cupStatus } from '../../../engine/cups'
import { nextUserMatch } from '../../../store/game'
import type { Game } from '../../../store/game'
import { formatDate } from '../../format'
import { Eyebrow, Panel } from '../../theme'
import { cupStatusText } from '../standings/Cups'
import { matchLabel } from '../../../engine/cups'

/** Copas em que o seu time joga: onde está em cada uma e o próximo jogo de copa. Não aparece se ele não está em nenhuma. */
export function CupCard({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const mine = (game.season.cups ?? []).filter((c) => cupStatus(game.season, c, game.userTeamId).state !== 'out')
  if (mine.length === 0) return null
  const next = nextUserMatch(game)
  const nextCup = next?.cup ? next : game.season.matches.filter((m) => m.cup && m.status === 'scheduled' && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId)).sort((a, b) => a.date.localeCompare(b.date))[0]
  return (
    <Panel className="p-4" data-testid="cup-card">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>Copas</Eyebrow>
        <button type="button" onClick={onOpen} className="min-h-10 text-sm font-bold text-accent">
          Ver chaveamento
        </button>
      </div>
      <ul className="mt-1 space-y-2">
        {mine.map((cup) => (
          <li key={cup.id}>
            <div className="title text-2xl">{cup.name}</div>
            <div className="text-sm text-muted">{cupStatusText(game, cup)}</div>
          </li>
        ))}
      </ul>
      {nextCup && (
        <p className="mt-2 text-xs text-muted">
          Próximo jogo de copa: {matchLabel(game.season, nextCup).competition} · {matchLabel(game.season, nextCup).detail} · {formatDate(nextCup.date)}
        </p>
      )}
    </Panel>
  )
}
