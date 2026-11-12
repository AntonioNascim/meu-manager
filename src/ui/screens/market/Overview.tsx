import { useState } from 'react'
import { expectedSalary, interestContext, interestIn, marketValue } from '../../../engine/market'
import type { InterestLevel } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import type { Player, TransferOffer } from '../../../engine/types'
import { favoritesOf, teamById } from '../../../store/game'
import type { Game } from '../../../store/game'
import { avatarColors } from '../../avatarColors'
import { formatMoney, playerName } from '../../format'
import { POSITION_SHORT_LABELS } from '../../labels'
import { Avatar, Crest, Icon, ValueBadge } from '../../theme'
import { InterestText, clubName, shortMoney } from './parts'
import { Negotiation } from './Negotiation'
import type { MarketTab } from '../Market'

const CARD = 'card-bg overflow-hidden rounded-[14px] border border-white/[0.13] border-l-[3px] border-l-accent'
const HEAD = 'flex items-center gap-2 border-b border-white/[0.07] bg-gradient-to-r from-accent/[0.10] to-transparent px-3 py-2.5'
const INTEREST_PCT: Record<InterestLevel, number> = { none: 8, low: 33, medium: 66, high: 92 }

/** Alvo principal: o jogador de uma proposta enviada que ainda espera resposta (de preferência um favorito) ou o primeiro favorito. */
export function mainTarget(game: Game): { player: Player; offer?: TransferOffer } | undefined {
  const byId = new Map(game.season.players.map((p) => [p.id, p]))
  const favorites = favoritesOf(game)
  const pending = game.season.market.offers.filter((o) => o.direction === 'outgoing' && o.status === 'pending')
  const offer = pending.find((o) => favorites.includes(o.playerId)) ?? pending[0]
  const offered = offer ? byId.get(offer.playerId) : undefined
  if (offer && offered) return { player: offered, offer }
  const first = favorites.map((id) => byId.get(id)).find((p) => p !== undefined)
  return first ? { player: first } : undefined
}

/** Resumo do mercado: alvo principal, lista de alvos (favoritos) e atividade recente. Nada some: as abas de busca, listas e propostas seguem ao lado. */
export function Overview({ game, open, onTab }: { game: Game; open: boolean; onTab: (tab: MarketTab) => void }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const state = game.season
  const date = state.season.currentDate
  const target = mainTarget(game)
  const byId = new Map(state.players.map((p) => [p.id, p]))
  const ctx = interestContext(state, game.userTeamId)
  const favorites = favoritesOf(game)
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
  const buyer = state.teams.find((t) => t.id === game.userTeamId)
  const recent = state.market.history.slice(-4).reverse()
  const picked = pickedId ? byId.get(pickedId) : undefined

  return (
    <div className="space-y-3" data-testid="market-overview">
      <section className={CARD} data-testid="main-target">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-gradient-to-r from-accent/[0.10] to-transparent px-3 py-2.5">
          <span className="font-display text-[19px] font-bold leading-none">Alvo principal</span>
          <span className="text-[13px] text-muted">{target?.offer ? 'Negociação em andamento' : 'Seu favorito'}</span>
        </div>
        {target ? (
          (() => {
            const { player, offer } = target
            const holder = state.teams.find((t) => t.id === player.teamId)
            const interest = interestIn(ctx, player, offer?.kind ?? 'purchase')
            const value = player.teamId === null ? 0 : marketValue(player, date, holder)
            return (
              <div className="p-3">
                <div className="grid grid-cols-[auto_1fr] gap-3">
                  <button type="button" onClick={() => setPickedId(player.id)} className="flex w-[5.2rem] flex-col items-center gap-1" aria-label={`Negociar com ${playerName(player)}`}>
                    <span className="relative">
                      <Avatar id={player.id} {...(avatarColors(game, player) ? { colors: avatarColors(game, player) as [string, string] } : {})} size={72} ring />
                      <span className="absolute -right-2 -top-1">
                        <ValueBadge value={playerOverall(player)} className="!min-w-9 !px-1.5 !py-0.5 !text-lg">
                          {Math.round(playerOverall(player))}
                        </ValueBadge>
                      </span>
                    </span>
                    <b className="max-w-full truncate font-display text-[16px] leading-tight">{playerName(player)}</b>
                    <span className="max-w-full truncate text-[12px] text-muted">{clubName(game, player.teamId)}</span>
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-display text-[18px] font-bold text-accent">
                        <Icon name="mail" size={18} />
                        {offer ? 'Proposta enviada' : 'Sem proposta'}
                      </span>
                      <span className="text-[13px] font-bold text-accent">{INTEREST_PCT[interest.level]}%</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Interesse do jogador">
                      <div className="h-full rounded-full bg-gradient-to-r from-accent-2 to-accent" style={{ width: `${INTEREST_PCT[interest.level]}%` }} />
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {POSITION_SHORT_LABELS[player.position]} · {player.age} anos · <InterestText interest={interest} />
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[12px] text-muted">
                      <span>
                        {player.teamId === null ? 'Contrato' : 'Valor de mercado'}
                        <b className="block font-display text-[17px] text-white">{player.teamId === null ? 'Livre' : shortMoney(value)}</b>
                      </span>
                      <span>
                        Salário
                        <b className="block font-display text-[17px] text-white">{formatMoney(offer?.salary ?? expectedSalary(player, buyer))}</b>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => setPickedId(player.id)} className="btn-primary min-h-12 rounded-[10px] font-display text-[17px] font-bold">
                    Negociar contrato
                  </button>
                  <button type="button" onClick={() => onTab(offer ? 'proposals' : 'favorites')} className="min-h-12 rounded-[10px] border-[1.5px] border-accent bg-black/30 font-display text-[17px] font-bold">
                    {offer ? 'Alterar proposta' : 'Ver favoritos'}
                  </button>
                </div>
              </div>
            )
          })()
        ) : (
          <div className="p-4 text-sm text-muted">
            Marque jogadores com a estrela na busca para montar a sua lista de alvos. O favorito com proposta em andamento aparece aqui.
            <button type="button" onClick={() => onTab('search')} className="btn-primary mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] font-display text-[17px] font-bold">
              <Icon name="search" size={18} />
              Buscar jogadores
            </button>
          </div>
        )}
      </section>

      <section className={CARD} data-testid="target-list">
        <div className={HEAD}>
          <Icon name="users" size={22} className="text-white" />
          <span className="flex-1 font-display text-[19px] font-bold leading-none">Lista de alvos</span>
          <button type="button" onClick={() => onTab('favorites')} className="flex min-h-9 items-center text-[13px] font-bold text-accent">
            Ver favoritos
            <Icon name="chev" size={16} />
          </button>
        </div>
        {favorites.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nenhum alvo ainda. Toque na estrela de um jogador para acompanhá-lo.</p>
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {favorites.slice(0, 5).map((p, i) => {
              const holder = state.teams.find((t) => t.id === p.teamId)
              const interest = interestIn(ctx, p)
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setPickedId(p.id)} className={`flex min-h-[68px] w-full items-center gap-2.5 px-3 py-2 text-left ${i === 0 ? 'bg-accent/[0.08]' : ''}`}>
                    <span className="w-4 shrink-0 text-center font-display text-[16px] font-bold">{i + 1}</span>
                    <Avatar id={p.id} {...(avatarColors(game, p) ? { colors: avatarColors(game, p) as [string, string] } : {})} size={46} ring />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate font-display text-[18px] leading-tight">{playerName(p)}</b>
                      <span className="block truncate text-[12px] text-muted">
                        {POSITION_SHORT_LABELS[p.position]}, {p.age} anos, {clubName(game, p.teamId)}
                      </span>
                      <span className="block text-[12px] text-muted">
                        <InterestText interest={interest} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <b className="block font-display text-[17px]">{p.teamId === null ? 'Livre' : shortMoney(marketValue(p, date, holder))}</b>
                      <ValueBadge value={playerOverall(p)}>{Math.round(playerOverall(p))}</ValueBadge>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={CARD} data-testid="recent-market">
        <div className={HEAD}>
          <Icon name="doc" size={22} className="text-white" />
          <span className="flex-1 font-display text-[19px] font-bold leading-none">Atividade recente do mercado</span>
          <button type="button" onClick={() => onTab('history')} className="flex min-h-9 items-center text-[13px] font-bold text-accent">
            Histórico
            <Icon name="chev" size={16} />
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="p-4 text-sm text-muted">Ainda não houve transferências nesta temporada.</p>
        ) : (
          <ul className="divide-y divide-white/[0.07]">
            {recent.map((r, i) => {
              const p = byId.get(r.playerId)
              const to = teamById(game, r.toTeamId)
              return (
                <li key={`${r.playerId}-${r.date}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                  {p ? <Avatar id={p.id} colors={to.colors} size={40} ring /> : <span className="h-10 w-10" />}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-display text-[17px] leading-tight">{p ? playerName(p) : r.playerId}</b>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted">
                      <Crest team={to} size="xs" />
                      <span className="truncate">{clubName(game, r.fromTeamId)} → {to.abbreviation}</span>
                    </span>
                  </span>
                  <b className="shrink-0 font-display text-[17px] text-accent">{r.fee > 0 ? shortMoney(r.fee) : 'Grátis'}</b>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {picked && <Negotiation key={picked.id} game={game} player={picked} open={open} onClose={() => setPickedId(null)} />}
    </div>
  )
}
