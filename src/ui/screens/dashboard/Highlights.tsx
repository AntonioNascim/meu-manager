import { squadOf, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import type { Player } from '../../../engine/types'
import { Eyebrow, Icon, Panel } from '../../theme'
import type { IconName } from '../../theme'
import { averageRating } from '../../squadSort'

/** Mínimo de jogos com nota para entrar na disputa da melhor nota média. */
const MIN_RATED_GAMES = 3

const nameOf = (p: Player) => p.nickname ?? p.name.split(' ').slice(-1)[0] ?? p.name

interface Entry {
  player: Player
  value: number
}

export interface SquadHighlights {
  scorer?: Entry
  assister?: Entry
  rated?: Entry
}

/** Artilheiro, garçom e melhor nota média do time na temporada (empate: quem jogou menos minutos). */
export function squadHighlights(squad: readonly Player[]): SquadHighlights {
  const best = (value: (p: Player) => number | undefined, min: number) => {
    let top: Entry | undefined
    for (const p of squad) {
      const v = value(p)
      if (v === undefined || v < min) continue
      if (!top || v > top.value || (v === top.value && p.seasonStats.minutes < top.player.seasonStats.minutes)) top = { player: p, value: v }
    }
    return top
  }
  const scorer = best((p) => p.seasonStats.goals, 1)
  const assister = best((p) => p.seasonStats.assists, 1)
  const rated = best((p) => (p.seasonStats.ratedGames >= MIN_RATED_GAMES ? averageRating(p) : undefined), 0)
  return { ...(scorer ? { scorer } : {}), ...(assister ? { assister } : {}), ...(rated ? { rated } : {}) }
}

function Tile({ icon, label, entry, format, onOpen }: { icon: IconName; label: string; entry: Entry | undefined; format: (v: number) => string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-surface px-1 py-2 text-center">
      <Icon name={icon} size={20} className="text-accent" />
      <span className="title text-3xl leading-none tabular-nums">{entry ? format(entry.value) : '–'}</span>
      <span className="w-full truncate text-xs font-bold">{entry ? nameOf(entry.player) : 'Ninguém ainda'}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
    </button>
  )
}

export function Highlights({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const h = squadHighlights(squadOf(game, userTeam(game).id))
  return (
    <Panel className="p-4" data-testid="highlights">
      <Eyebrow>Destaques do elenco</Eyebrow>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile icon="ball" label="Artilheiro" entry={h.scorer} format={(v) => String(v)} onOpen={onOpen} />
        <Tile icon="boot" label="Garçom" entry={h.assister} format={(v) => String(v)} onOpen={onOpen} />
        <Tile icon="star" label="Nota média" entry={h.rated} format={(v) => v.toFixed(2).replace('.', ',')} onOpen={onOpen} />
      </div>
    </Panel>
  )
}
