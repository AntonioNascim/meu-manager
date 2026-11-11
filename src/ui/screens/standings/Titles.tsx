import type { Game } from '../../../store/game'
import { cupSeasonLabel, tierName } from '../../../store/game'
import { Icon, Panel } from '../../theme'

export interface Title {
  key: string
  name: string
  season: string
  /** Para ordenar do mais recente ao mais antigo. */
  year: number
}

/**
 * Títulos do clube do jogador, calculados do histórico: campeonatos (temporadas encerradas em `seasonLog`)
 * e copas (`cupHistory`). Nada é guardado: tudo vem do que já existe no jogo.
 */
export function titlesOf(game: Game): Title[] {
  const me = game.userTeamId
  const league: Title[] = game.seasonLog.flatMap((s) =>
    s.champions.flatMap((id, i) => (id === me ? [{ key: `liga-${s.year}-${i}`, name: tierName(game, i + 1), season: String(s.label ?? s.year), year: s.year }] : [])),
  )
  const cups: Title[] = Object.entries(game.season.cupHistory ?? {}).flatMap(([cup, list]) =>
    list.flatMap((h) => (h.winnerId === me ? [{ key: `copa-${cup}-${h.year}`, name: game.season.cupSpecs?.find((s) => s.id === cup)?.name ?? cup, season: cupSeasonLabel(game, cup, h.year), year: h.year }] : [])),
  )
  return [...league, ...cups].sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'pt-BR'))
}

/** Conquistas: a lista de títulos do clube, do mais recente ao mais antigo. */
export function Titles({ game }: { game: Game }) {
  const titles = titlesOf(game)
  return (
    <div className="space-y-3" data-testid="titles">
      <h3 className="font-display text-lg font-bold uppercase tracking-wide text-muted">Conquistas do seu clube</h3>
      {titles.length === 0 ? (
        <Panel className="p-4 text-sm text-muted">Ainda não há títulos. Os campeonatos e as copas que o seu clube ganhar aparecem aqui.</Panel>
      ) : (
        <div className="grid grid-cols-3 gap-2 rounded-[14px] border border-gold/50 bg-gradient-to-b from-[#1a1408] to-[#0b0c0a] p-2.5">
          {titles.map((t) => (
            <div key={t.key} className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.13] bg-surface p-2.5 text-center">
              <Icon name="trophy" size={30} className="text-gold" />
              <b className="font-display text-[15px] font-bold leading-tight">{t.name}</b>
              <span className="text-[13px] text-muted">{t.season}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
