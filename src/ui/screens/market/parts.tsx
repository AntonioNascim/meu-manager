import type { ReactNode } from 'react'
import { isWindowOpen, marketValue, windowOfTeam, windowsFor } from '../../../engine/market'
import { regionOfTeam } from '../../../engine/season'
import type { Interest } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import type { Player } from '../../../engine/types'
import { favoritesOf, squadOf, teamById, toggleFavorite, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { daysBetween, formatCompactMoney, formatDate, playerName } from '../../format'
import { INTEREST_COLORS, INTEREST_LABELS, POSITION_SHORT_LABELS, WINDOW_LABELS } from '../../labels'
import { updateGame } from '../../../store/gameStore'
import { avatarColors } from '../../avatarColors'
import { Avatar, Flag, Icon, Panel, ValueBadge } from '../../theme'
import { shortName } from '../standings/parts'

/** Valor curto para a lista: "R$ 51 mi", "R$ 8,3 mi", "R$ 840 mil". */
export function shortMoney(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: value >= 10_000_000 ? 0 : 1 })} mi`
  return `R$ ${Math.round(value / 1_000).toLocaleString('pt-BR')} mil`
}

export const clubName = (game: Game, id: string | null) => (id ? shortName(teamById(game, id)) : 'Livre')

const shortDate = (date: string) => date.split('-').reverse().slice(0, 2).join('/')

/** Janela de transferências: orçamento de compras, vagas no elenco e o aviso (aberta ou fechada), no topo de todas as abas do mercado. */
export function WindowBanner({ game }: { game: Game }) {
  const state = game.season
  const date = state.season.currentDate
  const window = windowOfTeam(state, date, game.userTeamId)
  const next = windowsFor(state, regionOfTeam(state, game.userTeamId), date).find((w) => w.start > date)
  const team = userTeam(game)
  const left = window ? daysBetween(date, window.end) : 0
  return (
    <Panel className="gap-0 p-3.5">
      <div className="flex items-center justify-between border-b border-white/[0.07] py-1.5 text-[13.5px]">
        <span className="text-muted">Orçamento de compras</span>
        <b className="font-display text-xl text-accent">{formatCompactMoney(team.finances.transferBudget)}</b>
      </div>
      <div className="flex items-center justify-between py-1.5 text-[13.5px]">
        <span className="text-muted">Elenco</span>
        <b className="font-display text-xl">{squadOf(game, team.id).length} / 30</b>
      </div>
      {window ? (
        <div className="mt-1 flex items-start gap-2 rounded-xl border border-accent/55 bg-accent/10 px-3 py-2 text-[13px] text-accent">
          <Icon name="check" size={16} className="mt-0.5" />
          <div>
            <b className="block">Janela de transferências aberta</b>
            <span className="text-slate-200">
              {WINDOW_LABELS[window.name]} · {left <= 0 ? 'fecha hoje' : `fecha em ${left} ${left === 1 ? 'dia' : 'dias'}`} ({shortDate(window.end)})
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-start gap-2 rounded-xl border border-amber/55 bg-amber/10 px-3 py-2 text-[13px] text-amber">
          <Icon name="alert" size={16} className="mt-0.5" />
          <div>
            <b className="block">Janela de transferências fechada</b>
            <span className="text-slate-200">{next ? `${WINDOW_LABELS[next.name]} abre em ${formatDate(next.start)}.` : 'Só abre de novo na próxima temporada.'}</span>
          </div>
        </div>
      )}
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
  const value = marketValue(player, game.season.season.currentDate, game.season.teams.find((t) => t.id === player.teamId))
  return (
    <li className="flex items-center">
      <button type="button" onClick={onOpen} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-2 py-2 pl-3 pr-2 text-left">
        <span className="inline-block w-9 shrink-0 rounded-[5px] bg-accent/10 px-1 py-0.5 text-center font-display text-xs font-bold tracking-wide text-accent">{POSITION_SHORT_LABELS[player.position]}</span>
        <Avatar id={player.id} {...(avatarColors(game, player) ? { colors: avatarColors(game, player) as [string, string] } : {})} size={40} ring />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="line-clamp-2 min-w-0 font-semibold leading-tight [overflow-wrap:anywhere]">{playerName(player)}</span>
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
              <span className="block font-display text-[17px] font-bold tabular-nums">{player.teamId === null ? 'Livre' : shortMoney(value)}</span>
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
      className={`flex h-12 w-11 shrink-0 items-center justify-center ${on ? 'text-amber' : 'text-muted'}`}
    >
      <Icon name="star" size={22} className={on ? 'fill-current' : ''} />
    </button>
  )
}
