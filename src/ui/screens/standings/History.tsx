import type { Game } from '../../../store/game'
import { cupSeasonLabel, teamById, tierName } from '../../../store/game'
import { Icon, Panel } from '../../theme'
import { SectionHeader, TeamLink, shortName } from './parts'

/** Histórico: campeões de cada temporada, quem subiu e quem caiu, e a posição do seu time em cada ano. */
export function History({ game, onTeam }: { game: Game; onTeam: (id: string) => void }) {
  const log = [...game.seasonLog].reverse()
  const name = (id: string) => teamById(game, id)
  const cupChampions = Object.entries(game.season.cupHistory ?? {})
    .flatMap(([cup, list]) => list.map((h) => ({ cup, year: h.year, winnerId: h.winnerId, name: game.season.cupSpecs?.find((s) => s.id === cup)?.name ?? cup })))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'pt-BR'))
  return (
    <div className="space-y-3">
      <SectionHeader icon="trophy" title="Histórico" subtitle="Temporadas encerradas" tone="violet" />
      {cupChampions.length > 0 && (
        <Panel className="p-4" >
          <h3 className="title text-2xl">Campeões das copas</h3>
          <ul className="mt-2 space-y-1 text-sm" data-testid="cup-history">
            {cupChampions.map((c) => (
              <li key={`${c.cup}-${c.year}`} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-muted">{cupSeasonLabel(game, c.cup, c.year)}</span>
                <span className="w-32 shrink-0 truncate text-xs text-muted">{c.name}</span>
                <TeamLink team={name(c.winnerId)} onOpen={onTeam} className="font-bold" />
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {log.length === 0 && <Panel className="p-4 text-sm text-muted">Nenhuma temporada foi encerrada ainda. Os campeões, os acessos e os rebaixamentos aparecem aqui depois da primeira virada de temporada.</Panel>}
      {log.map((s) => (
        <Panel key={s.year} className="p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="title text-3xl">{s.label ?? s.year}</h3>
            <span className="text-xs font-bold text-accent">
              Seu time: {s.userPosition}º na {tierName(game, s.userTier)}
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {s.champions.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="text-amber-300">
                  <Icon name="trophy" size={18} />
                </span>
                <span className="w-16 shrink-0 text-xs text-muted">{tierName(game, i + 1)}</span>
                <TeamLink team={name(id)} onOpen={onTeam} className="font-bold" />
              </li>
            ))}
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-win">▲</span>
              <span className="min-w-0 flex-1 text-slate-200">
                <b className="text-win">Subiram:</b> {s.promoted.map((id) => shortName(name(id))).join(', ') || '–'}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-loss">▼</span>
              <span className="min-w-0 flex-1 text-slate-200">
                <b className="text-loss">Caíram:</b> {s.relegated.map((id) => shortName(name(id))).join(', ') || '–'}
              </span>
            </li>
          </ul>
        </Panel>
      ))}
    </div>
  )
}
