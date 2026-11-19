import { useState } from 'react'
import { annualSponsorship } from '../../../engine/finance'
import { SPONSOR, betOptions, betPrize, bonusPosition, sponsorBonusAmount } from '../../../engine/sponsor'
import { BET_KINDS } from '../../../engine/types'
import type { BetKind, SponsorOffer } from '../../../engine/types'
import { userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { perform } from '../../../store/actions'
import { formatMoney } from '../../format'
import { BET_LABELS, OBJECTIVE_TEXT, SPONSOR_OFFER_LABELS, commandErrorText } from '../../labels'
import { Eyebrow, Panel } from '../../theme'

const OFFERS: SponsorOffer[] = [1, 2, 3]

/** Quantos jogos de liga o time já fez (a escolha do patrocinador fecha no primeiro). */
const playedOf = (game: Game): number => game.season.matches.filter((m) => m.cup === undefined && m.status === 'finished' && (m.homeTeamId === game.userTeamId || m.awayTeamId === game.userTeamId)).length

/**
 * Patrocinador: três ofertas de 1 temporada que trocam uma coisa pela outra (fixo, fixo menor com bônus por posição, fixo médio com bônus por
 * superar a meta), com a receita esperada parecida com a de hoje. Escolhe-se até o primeiro jogo; sem escolha vale a oferta 1.
 */
export function SponsorCard({ game }: { game: Game }) {
  const team = userTeam(game)
  const chosen: SponsorOffer = team.sponsor ?? 1
  const open = playedOf(game) === 0
  const S = annualSponsorship(team)
  const [message, setMessage] = useState<string | null>(null)
  const choose = (offer: SponsorOffer) => {
    setMessage(null)
    void perform({ type: 'sponsor', offer }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }
  return (
    <Panel className="space-y-3 p-4" data-testid="sponsor-card">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Patrocinador</Eyebrow>
        <span className="text-xs font-semibold text-muted">{open ? 'Escolha até o 1º jogo' : 'Contrato da temporada'}</span>
      </div>
      <ul className="space-y-1.5" role="radiogroup" aria-label="Oferta de patrocínio">
        {OFFERS.map((offer) => {
          const o = SPONSOR.offers[offer]
          const on = chosen === offer
          const need = bonusPosition(offer, team.objective.targetPosition)
          return (
            <li key={offer}>
              <button type="button" role="radio" aria-checked={on} disabled={!open} onClick={() => choose(offer)} className={`w-full rounded-xl border p-3 text-left active:scale-[0.99] disabled:opacity-70 ${on ? 'border-accent bg-accent/[0.08]' : 'border-line bg-surface'}`} data-testid="sponsor-offer" data-offer={offer}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold ${on ? 'text-accent' : ''}`}>{SPONSOR_OFFER_LABELS[offer].title}</span>
                  <span className="text-xs font-bold tabular-nums text-muted">{formatMoney(Math.round((S * o.fixed) / 12))}/mês</span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-300">
                  {SPONSOR_OFFER_LABELS[offer].text}
                  {o.bonus > 0 && need !== null ? ` Bônus de ${formatMoney(sponsorBonusAmount(team, offer))} se terminar ${need === 1 ? 'campeão' : `em ${need}º ou melhor`}.` : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {message && (
        <p className="text-sm font-semibold text-loss" role="alert">
          {message}
        </p>
      )}
    </Panel>
  )
}

/** Aposta do ano: uma meta extra e opcional, do tamanho do clube, escolhida nas primeiras rodadas; cumprindo, o prêmio é meio mês de receita. */
export function BetCard({ game }: { game: Game }) {
  const team = userTeam(game)
  const bet = team.bet && team.bet.year === game.season.season.year ? team.bet : undefined
  const open = !bet && playedOf(game) <= SPONSOR.betMaxPlayed
  const options = betOptions(game.season, team)
  const prize = betPrize(team)
  const [message, setMessage] = useState<string | null>(null)
  const choose = (kind: BetKind) => {
    setMessage(null)
    void perform({ type: 'bet', kind }).then((out) => {
      if (!out.ok) setMessage(commandErrorText(out.error))
    })
  }
  const r = team.rewards
  return (
    <Panel className="space-y-3 p-4" data-testid="bet-card">
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Aposta do ano</Eyebrow>
        <span className="text-xs font-semibold text-muted">Prêmio {formatMoney(prize)}</span>
      </div>
      {bet ? (
        <p className="rounded-xl border border-accent/40 bg-accent/[0.06] p-3 text-sm" data-testid="bet-chosen">
          Sua aposta: <b>{BET_LABELS[bet.kind](bet.target)}</b>. Se cumprir até o fim da temporada, o clube paga {formatMoney(prize)}; se não, nada.
        </p>
      ) : open ? (
        <ul className="space-y-1.5">
          {BET_KINDS.map((kind) => (
            <li key={kind}>
              <button type="button" onClick={() => choose(kind)} className="w-full rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]" data-testid="bet-option" data-kind={kind}>
                <span className="block font-bold">{BET_LABELS[kind](options[kind])}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">O prazo da aposta desta temporada já passou. A meta da diretoria continua sendo: {OBJECTIVE_TEXT(team.objective.targetPosition).toLowerCase()}.</p>
      )}
      <p className="text-xs text-muted">Opcional: uma meta extra por temporada, do tamanho do clube. Cumprindo ganha o prêmio; não cumprindo, não perde nada.</p>
      {r && (
        <p className="rounded-xl border border-line bg-surface p-3 text-xs text-slate-300" data-testid="rewards-last">
          Temporada {r.year}: terminou em {r.position}º.
          {r.offer ? ` Bônus do patrocinador: ${r.bonus ? formatMoney(r.bonus) : 'nenhum'}.` : ''}
          {r.bet ? ` Aposta (${BET_LABELS[r.bet.kind](r.bet.target).toLowerCase()}): ${r.betWon ? `cumprida, ${formatMoney(r.prize ?? 0)}` : 'não cumprida'}.` : ''}
        </p>
      )}
      {message && (
        <p className="text-sm font-semibold text-loss" role="alert">
          {message}
        </p>
      )}
    </Panel>
  )
}
