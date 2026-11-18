import { playerOverall } from '../../../engine/overall'
import { nextUserMatch } from '../../../store/game'
import type { Game } from '../../../store/game'
import { playerName } from '../../format'
import { POSITION_LABELS, SCOUT_SECTOR_LABELS } from '../../labels'
import { Avatar, Eyebrow, Panel, ValueBadge } from '../../theme'
import { outlookAgainst, sectorLevels, sectorVerdict, SCOUT_SECTORS, starOf } from './scouting'
import { teamById } from '../../../store/game'

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * O adversário lido de perto: prognóstico do próximo jogo (vitória, empate e derrota, uma estimativa pela força dos onze e pelo mando),
 * o craque do time e a força de cada setor contra a do seu. Só leitura.
 */
export function ScoutingSection({ game, teamId }: { game: Game; teamId: string }) {
  const team = teamById(game, teamId)
  const next = nextUserMatch(game)
  const meets = next && (next.homeTeamId === teamId || next.awayTeamId === teamId) && !next.cup ? next : undefined
  const outlook = meets ? outlookAgainst(game, teamId, meets.homeTeamId === game.userTeamId) : undefined
  const star = starOf(game, teamId)
  const levels = sectorLevels(game, teamId)
  const mine = sectorLevels(game, game.userTeamId)
  const verdict = sectorVerdict(game, teamId)
  return (
    <Panel className="space-y-3 p-4" data-testid="scouting">
      <Eyebrow>Leitura do adversário</Eyebrow>
      {outlook && (
        <div data-testid="outlook">
          <p className="text-xs text-muted">Estimativa para o próximo jogo, pela força dos onze e pelo mando:</p>
          <div className="mt-1.5 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Vitória ${pct(outlook.win)}, empate ${pct(outlook.draw)}, derrota ${pct(outlook.lose)}`}>
            <span className="bg-win" style={{ width: pct(outlook.win) }} />
            <span className="bg-draw" style={{ width: pct(outlook.draw) }} />
            <span className="bg-loss" style={{ width: pct(outlook.lose) }} />
          </div>
          <div className="mt-1 flex justify-between text-xs font-bold">
            <span className="text-win">Vitória {pct(outlook.win)}</span>
            <span className="text-draw">Empate {pct(outlook.draw)}</span>
            <span className="text-loss">Derrota {pct(outlook.lose)}</span>
          </div>
        </div>
      )}
      {star && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5" data-testid="star">
          <Avatar id={star.star.id} colors={team.colors} size={40} ring />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">O craque</p>
            <p className="truncate font-bold">{playerName(star.star)}</p>
            <p className="text-xs text-muted">
              {POSITION_LABELS[star.star.position]} · {star.star.age} anos{star.star.condition.injuryDaysLeft > 0 ? ' · lesionado' : ''}
            </p>
          </div>
          <ValueBadge value={star.overall}>{Math.round(playerOverall(star.star))}</ValueBadge>
        </div>
      )}
      <ul className="space-y-1.5" data-testid="sectors">
        {SCOUT_SECTORS.map((s) => {
          const d = verdict.diff[s]
          return (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 font-semibold">{SCOUT_SECTOR_LABELS[s]}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className={`block h-full ${d > 1.5 ? 'bg-loss' : d < -1.5 ? 'bg-win' : 'bg-slate-400'}`} style={{ width: `${Math.max(8, Math.min(100, levels[s]))}%` }} />
              </span>
              <span className="w-10 text-right font-extrabold tabular-nums">{levels[s].toFixed(0)}</span>
              <span className={`w-12 text-right text-xs font-bold tabular-nums ${d > 1.5 ? 'text-loss' : d < -1.5 ? 'text-win' : 'text-muted'}`}>{mine[s] > 0 ? `${d > 0 ? '+' : ''}${d.toFixed(0)}` : ''}</span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted">
        O ponto forte deles é o <b className="text-slate-200">{SCOUT_SECTOR_LABELS[verdict.strongest].toLowerCase()}</b>; o mais fraco, o <b className="text-slate-200">{SCOUT_SECTOR_LABELS[verdict.weakest].toLowerCase()}</b>. Os números ao lado comparam com o seu time.
      </p>
    </Panel>
  )
}
