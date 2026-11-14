import { useState } from 'react'
import { interestContext, interestIn, isWindowOpen, marketValue } from '../../engine/market'
import { playerOverall } from '../../engine/overall'
import type { OfferKind, Player } from '../../engine/types'
import type { Game } from '../../store/game'
import { formatMoney, playerName } from '../format'
import { NATIONALITY_LABELS, POSITION_LABELS } from '../labels'
import { Avatar, Crest, Flag, Icon, ValueBadge } from '../theme'
import { Negotiation } from '../screens/market/Negotiation'
import { FavoriteStar } from '../screens/market/parts'
import { goToCoachTrade } from '../navigation'

/**
 * Cartão grande de um jogador de outro clube (ou livre): o mesmo desenho do cartão do seu jogador, mas em vez das ações do seu elenco
 * tem um botão só: "Fazer proposta" (ou "Contratar", se ele é livre). Sem interesse dele em vir, o toque só avisa; com interesse, abre a negociação do mercado.
 */
export function OtherPlayerCard({ game, player, offerKind }: { game: Game; player: Player; offerKind?: OfferKind }) {
  const [negotiating, setNegotiating] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const state = game.season
  const date = state.season.currentDate
  const team = state.teams.find((t) => t.id === player.teamId)
  const free = player.teamId === null
  const overall = playerOverall(player)
  // No online, o jogador de outro técnico humano não se negocia com a IA: vai pelo mercado entre técnicos.
  const humanOwned = player.teamId !== null && (game.online?.humans ?? []).includes(player.teamId)
  const open = isWindowOpen(state, date, [game.userTeamId])

  const tap = () => {
    if (humanOwned) return goToCoachTrade({ playerId: player.id, teamId: player.teamId as string })
    const interest = interestIn(interestContext(state, game.userTeamId), player, 'purchase')
    if (interest.level === 'none') return setNote('Esse jogador não tem interesse em jogar no seu time.')
    setNote(null)
    setNegotiating(true)
  }

  return (
    <div data-testid="player-card" className="space-y-3">
      <section className="card-bg overflow-hidden rounded-[16px] border border-accent/45 p-2.5 shadow-[inset_0_0_30px_rgb(39_224_90/0.06),0_0_18px_rgb(39_224_90/0.1)]" data-testid="player-top-card">
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-2.5 gap-y-1 min-[440px]:grid-cols-[116px_minmax(0,1fr)] min-[440px]:gap-x-4">
          <div className="relative flex h-[150px] flex-col items-center justify-start overflow-hidden rounded-[12px] border border-accent/55 bg-gradient-to-b from-[#12201a] to-[#070d0a] pt-2 shadow-[inset_0_0_24px_rgb(39_224_90/0.12)] min-[440px]:row-span-2 min-[440px]:h-[200px]" data-testid="player-avatar">
            <Avatar id={player.id} {...(team ? { colors: team.colors } : {})} size={96} />
            {team && (
              <span className="absolute bottom-2">
                <Crest team={team} size="sm" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-end gap-1.5">
              <ValueBadge value={overall} className="!min-w-12 !px-2.5 !py-1 !text-[34px] !leading-none" data-testid="card-force">
                {Math.round(overall)}
              </ValueBadge>
              <span className="pb-1 text-[11px] font-bold uppercase tracking-wider text-accent">Força</span>
            </div>
            <div className="title mt-1 line-clamp-3 text-[18px] leading-[1.05] min-[440px]:text-[24px]" data-testid="card-name">
              {playerName(player)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-200">
              <Flag nationality={player.nationality} />
              <span className="truncate">{NATIONALITY_LABELS[player.nationality]}</span>
            </div>
          </div>
          <dl className="col-span-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 border-t border-white/[0.08] pt-2 text-[12px] min-[440px]:col-span-1 min-[440px]:col-start-2">
            <dt className="flex items-center gap-1.5 text-muted"><Icon name="target" size={14} className="text-slate-300" />Posição</dt>
            <dd className="text-right font-bold">{POSITION_LABELS[player.position]}</dd>
            <dt className="flex items-center gap-1.5 text-muted"><Icon name="user" size={14} className="text-slate-300" />Idade</dt>
            <dd className="text-right font-bold">{player.age} anos</dd>
            <dt className="flex items-center gap-1.5 whitespace-nowrap text-muted"><Icon name="dollar" size={14} className="text-slate-300" />Valor de mercado</dt>
            <dd className="whitespace-nowrap text-right font-bold tabular-nums" data-testid="card-value">
              {free ? 'Livre' : formatMoney(marketValue(player, date, team))}
            </dd>
          </dl>
        </div>
        <button type="button" onClick={tap} data-testid="make-offer" className="btn-primary mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] font-display text-lg font-bold active:scale-95">
          <Icon name="hand" size={20} />
          {free ? 'Contratar' : 'Fazer proposta'}
        </button>
        <div className="mt-2 flex items-center justify-between gap-2 text-sm text-slate-200">
          <span>Favoritar para acompanhar na aba Favoritos</span>
          <FavoriteStar game={game} playerId={player.id} />
        </div>
        {note && (
          <p className="mt-2 text-sm text-amber-300" role="status" data-testid="offer-note">
            {note}
          </p>
        )}
      </section>
      {negotiating && <Negotiation key={player.id} game={game} player={player} open={open} {...(offerKind ? { initialKind: offerKind } : {})} onClose={() => setNegotiating(false)} />}
    </div>
  )
}
