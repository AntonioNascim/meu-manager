import type { ReactNode } from 'react'
import { isWindowOpen, marketValue, transferWindows, windowAt } from '../../../engine/market'
import type { Interest } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import type { Player } from '../../../engine/types'
import { favoritesOf, squadOf, teamById, toggleFavorite, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { daysBetween, formatCompactMoney, formatDate, playerName } from '../../format'
import { INTEREST_COLORS, INTEREST_LABELS, POSITION_SHORT_LABELS, WINDOW_LABELS } from '../../labels'
import { updateGame } from '../../../store/gameStore'
import { Flag, Icon, Panel, ValueBadge } from '../../theme'

/** Valor curto para a lista: "R$ 51 mi", "R$ 8,3 mi", "R$ 840 mil". */
export function shortMoney(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: value >= 10_000_000 ? 0 : 1 })} mi`
  return `R$ ${Math.round(value / 1_000).toLocaleString('pt-BR')} mil`
}

export const clubName = (game: Game, id: string | null) => (id ? teamById(game, id).name : 'Livre')

const shortDate = (date: string) => date.split('-').reverse().slice(0, 2).join('/')

/** Aviso da janela de transferências, no topo de todas as abas do mercado. */
export function WindowBanner({ game }: { game: Game }) {
  const state = game.season
  const date = state.season.currentDate
  const window = windowAt(state.season, state.matches, date)
  const next = transferWindows(state.season, state.matches).find((w) => w.start > date)
  const team = userTeam(game)
  const budget = (
    <div className="mt-1 text-xs text-muted">
      Orçamento de compras: <b className="text-slate-200">{formatCompactMoney(team.finances.transferBudget)}</b> · Elenco: <b className="text-slate-200">{squadOf(game, team.id).length}/30</b>
    </div>
  )
  if (window) {
    const left = daysBetween(date, window.end)
    return (
      <Panel glow className="flex items-start gap-3 p-4">
        <span className="mt-0.5 text-accent">
          <Icon name="swap" size={26} />
        </span>
        <div className="min-w-0">
          <div className="font-bold">Janela de transferências aberta</div>
          <div className="text-sm text-muted">
            {WINDOW_LABELS[window.name]} · {left <= 0 ? 'fecha hoje' : `fecha em ${left} ${left === 1 ? 'dia' : 'dias'}`} ({shortDate(window.end)})
          </div>
          {budget}
        </div>
      </Panel>
    )
  }
  return (
    <Panel className="flex items-start gap-3 p-4">
      <span className="mt-0.5 text-muted">
        <Icon name="swap" size={26} />
      </span>
      <div className="min-w-0">
        <div className="font-bold">Janela de transferências fechada</div>
        <div className="text-sm text-muted">{next ? `${WINDOW_LABELS[next.name]} abre em ${formatDate(next.start)}.` : 'Só abre de novo na próxima temporada.'}</div>
        {budget}
      </div>
    </Panel>
  )
}

export const useWindowOpen = (game: Game) => isWindowOpen(game.season)

/** Texto "interesse alto" colorido. */
export function InterestText({ interest, bare = false }: { interest: Interest; bare?: boolean }) {
  return (
    <span>
      {bare ? '' : 'interesse '}<span className={`font-bold ${INTEREST_COLORS[interest.level]}`}>{INTEREST_LABELS[interest.level]}</span>
    </span>
  )
}

/**
 * Linha de jogador do mercado: posição, bandeira, nome, posição e clube, idade, interesse (quando informado),
 * valor de mercado (ou `trailing`) e força no selo.
 */
export function MarketRow({
  game,
  player,
  interest,
  onOpen,
  trailing,
  note,
  favorite,
}: {
  game: Game
  player: Player
  interest?: Interest
  onOpen: () => void
  /** Troca o valor da direita (preço da lista, por exemplo). */
  trailing?: ReactNode
  note?: ReactNode
  favorite?: ReactNode
}) {
  const overall = playerOverall(player)
  const value = marketValue(player, game.season.season.currentDate)
  return (
    <li className="flex items-center">
      <button type="button" onClick={onOpen} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-2 py-2 pl-3 pr-2 text-left">
        <span className="w-8 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[player.position]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="truncate font-bold">{playerName(player)}</span>
          </span>
          <span className="block truncate text-xs text-muted">
            {POSITION_SHORT_LABELS[player.position]} · {clubName(game, player.teamId)}
          </span>
          <span className="block text-xs leading-snug text-muted">
            {player.age} anos
            {interest && (
              <>
                {' · '}
                <InterestText interest={interest} />
              </>
            )}
            {note}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {trailing ?? (
            <>
              <span className="block text-sm font-extrabold tabular-nums">{player.teamId === null ? 'Livre' : shortMoney(value)}</span>
              <span className="block text-[11px] text-muted">{player.teamId === null ? 'sem custo' : 'valor'}</span>
            </>
          )}
        </span>
        <ValueBadge value={overall}>{Math.round(overall)}</ValueBadge>
      </button>
      {favorite}
    </li>
  )
}

/** Estrela para acompanhar o jogador (aparece na aba Favoritos). */
export function FavoriteStar({ game, playerId }: { game: Game; playerId: string }) {
  const on = favoritesOf(game).includes(playerId)
  return (
    <button
      type="button"
      onClick={() => updateGame((g) => toggleFavorite(g, playerId))}
      aria-pressed={on}
      aria-label={on ? 'Tirar dos favoritos' : 'Marcar como favorito'}
      className={`flex h-12 w-11 shrink-0 items-center justify-center ${on ? 'text-amber-300' : 'text-muted'}`}
    >
      <Icon name="star" size={22} className={on ? 'fill-current' : ''} />
    </button>
  )
}
