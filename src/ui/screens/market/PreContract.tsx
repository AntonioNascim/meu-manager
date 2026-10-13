import { useMemo, useState } from 'react'
import { OfferError, PRE_CONTRACT_YEARS, canPreContract, expectedSalary, interestContext, interestIn, preContractsOpen } from '../../../engine/market'
import { playerOverall } from '../../../engine/overall'
import type { Player, PreContract } from '../../../engine/types'
import { offerUserPreContract, userPreContractsOf } from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { formatDate, formatMoney, playerName } from '../../format'
import { OFFER_REASON_LABELS } from '../../labels'
import { Flag, Panel, Sheet, ValueBadge } from '../../theme'
import { Search } from './Search'
import { InterestText, clubName } from './parts'

function PreContractSheet({ game, player, onClose }: { game: Game; player: Player; onClose: () => void }) {
  const state = game.season
  const interest = useMemo(() => interestIn(interestContext(state, game.userTeamId), player), [state, game.userTeamId, player])
  const [salary, setSalary] = useState(Math.ceil(expectedSalary(player) / 500) * 500)
  const [years, setYears] = useState(3)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = () => {
    try {
      const { game: next, result } = offerUserPreContract(game, player.id, { salary, years })
      if (result.accepted) {
        updateGame(() => next)
        setMessage({ ok: true, text: `${playerName(player)} aceitou: chega de graça na virada da temporada.` })
        return
      }
      const reason = result.reason ? OFFER_REASON_LABELS[result.reason] : 'Proposta recusada.'
      setMessage({ ok: false, text: result.minimumSalary !== undefined ? `${reason}. Ele aceitaria a partir de ${formatMoney(result.minimumSalary)}.` : reason })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof OfferError ? OFFER_REASON_LABELS[e.code] : 'Não foi possível propor.' })
    }
  }

  const input = 'mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold'
  const done = message?.ok === true
  return (
    <Sheet
      title="Pré-contrato"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {message && (
            <p className={`text-sm ${message.ok ? 'text-win' : 'text-loss'}`} role="status">
              {message.text}
            </p>
          )}
          <button type="button" onClick={done ? onClose : submit} className="min-h-12 w-full rounded-xl bg-accent font-bold text-accent-ink active:scale-95">
            {done ? 'Fechar' : 'Propor pré-contrato'}
          </button>
        </div>
      }
    >
      <div className="flex items-center gap-3 pb-3">
        <ValueBadge value={playerOverall(player)} className="!min-w-14 !px-3 !py-2 !text-3xl">
          {Math.round(playerOverall(player))}
        </ValueBadge>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="truncate text-lg font-extrabold">{playerName(player)}</span>
          </div>
          <div className="text-xs text-muted">
            {player.age} anos · {clubName(game, player.teamId)} · contrato até {formatDate(player.contract.endDate)}
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
        <div className="flex justify-between py-1">
          <span className="text-muted">Salário atual</span>
          <b>{formatMoney(player.contract.salary)}</b>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-muted">Interesse em vir</span>
          <InterestText interest={interest} bare />
        </div>
        {interest.minimumSalary !== null && (
          <div className="flex justify-between py-1">
            <span className="text-muted">Salário que ele aceitaria</span>
            <b>a partir de {formatMoney(interest.minimumSalary)}</b>
          </div>
        )}
        <div className="flex justify-between py-1">
          <span className="text-muted">Custo de transferência</span>
          <b className="text-win">Grátis</b>
        </div>
      </div>
      <label className="mt-3 block text-sm">
        Salário mensal
        <input type="number" min={0} step={500} className={input} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
      </label>
      <label className="mt-3 block text-sm">
        Duração do contrato
        <select className={input} value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {PRE_CONTRACT_YEARS.map((y) => (
            <option key={y} value={y}>
              {y} {y === 1 ? 'ano' : 'anos'}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-xs text-muted">O jogador responde na hora e só se junta ao time na virada da temporada, quando o contrato dele acaba.</p>
    </Sheet>
  )
}

function Deals({ game }: { game: Game }) {
  const { arriving, leaving } = userPreContractsOf(game)
  if (arriving.length === 0 && leaving.length === 0) return null
  const row = (c: PreContract, incoming: boolean) => {
    const p = game.season.players.find((q) => q.id === c.playerId)
    return (
      <li key={c.playerId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
        <span className="min-w-0 truncate font-bold">{p ? playerName(p) : c.playerId}</span>
        <span className="shrink-0 text-xs text-muted">
          {incoming ? `chega · ${formatMoney(c.salary)}/mês · ${c.years} ${c.years === 1 ? 'ano' : 'anos'}` : `vai para o ${clubName(game, c.toTeamId)}`}
        </span>
      </li>
    )
  }
  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-line">
        {arriving.map((c) => row(c, true))}
        {leaving.map((c) => row(c, false))}
      </ul>
      <p className="px-4 pb-3 pt-1 text-[11px] text-muted">Chegam e saem de graça na virada da temporada.</p>
    </Panel>
  )
}

/** Pré-contrato: quem está no último ano de contrato pode assinar agora e chegar de graça na virada. */
export function PreContractTab({ game, open }: { game: Game; open: boolean }) {
  const state = game.season
  const available = preContractsOpen(state)
  const eligible = useMemo(() => (p: Player) => canPreContract(state, p), [state])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = state.players.find((p) => p.id === pickedId)
  void open
  return (
    <div className="space-y-3">
      <Panel className="p-4 text-sm text-slate-300">
        {available
          ? 'Jogadores no último ano de contrato podem assinar agora com outro clube e chegar de graça na virada, se aceitarem o salário e o clube. Os seus jogadores nessa situação também podem ser procurados.'
          : 'Os pré-contratos abrem em 1º de julho. Só vale para quem está no último ano de contrato.'}
      </Panel>
      <Deals game={game} />
      {available && (
        <Search
          game={game}
          open
          restrict={eligible}
          showTier={false}
          onPick={(p) => setPickedId(p.id)}
          situations={['expiring']}
          preset={{ situation: 'expiring' }}
          trailing={() => (
            <>
              <span className="block text-sm font-extrabold text-win">Grátis</span>
              <span className="block text-[11px] text-muted">pré-contrato ›</span>
            </>
          )}
          note={() => <span> · vence em dez.</span>}
          empty="Ninguém disponível para pré-contrato com esses filtros."
        />
      )}
      {picked && <PreContractSheet key={picked.id} game={game} player={picked} onClose={() => setPickedId(null)} />}
    </div>
  )
}
