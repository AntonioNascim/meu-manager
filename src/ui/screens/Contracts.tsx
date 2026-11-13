import { useState } from 'react'
import { cycleOfTeam } from '../../engine/season'
import { expiringContracts, renewalDemand } from '../../engine/offseason'
import { playerOverall } from '../../engine/overall'
import type { Player } from '../../engine/types'
import { userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { perform } from '../../store/actions'
import { Button, Card } from '../components/ui'
import { formatDate, formatMoney, playerName } from '../format'
import { OFFER_REASON_LABELS, POSITION_SHORT_LABELS, commandErrorText } from '../labels'
import { MoneyInput } from '../components/MoneyInput'

/** Renovação de contratos: quem vence neste ano e no próximo, com o pedido de cada jogador. */
export function Contracts({ game }: { game: Game }) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const cycle = cycleOfTeam(game.season, game.userTeamId)
  const list = expiringContracts(game.season, game.userTeamId, 1)
  const picked = list.find((p) => p.id === pickedId)
  if (picked) return <RenewForm game={game} player={picked} onClose={() => setPickedId(null)} />

  return (
    <Card flush>
      <ul className="divide-y divide-slate-700">
        {list.map((p) => {
          const lastYear = p.contract.endDate <= cycle.end
          return (
            <li key={p.id}>
              <button type="button" className="flex min-h-14 w-full items-center gap-2 px-3 text-left" onClick={() => setPickedId(p.id)}>
                <span className="w-9 text-xs text-slate-400">{POSITION_SHORT_LABELS[p.position]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{playerName(p)}</span>
                  <span className={`block text-xs ${lastYear ? 'text-amber-300' : 'text-slate-400'}`}>até {formatDate(p.contract.endDate)}</span>
                </span>
                <span className="w-9 text-right font-semibold">{Math.round(playerOverall(p))}</span>
                <span className="w-24 text-right text-xs text-slate-300">{formatMoney(p.contract.salary)}</span>
              </button>
            </li>
          )
        })}
        {list.length === 0 && <li className="p-4 text-sm text-slate-400">Nenhum contrato vence neste ano nem no próximo.</li>}
      </ul>
    </Card>
  )
}

export function RenewForm({ game, player, onClose }: { game: Game; player: Player; onClose: () => void }) {
  const team = userTeam(game)
  const demand = renewalDemand(player, team)
  const [salary, setSalary] = useState(demand)
  const [years, setYears] = useState(3)
  const [message, setMessage] = useState<string | null>(null)

  const submit = () => {
    void perform({ type: 'club', action: { type: 'renew', playerId: player.id, years, salary } }).then((out) => {
      if (out.ok) return onClose()
      const reason = OFFER_REASON_LABELS[out.error as keyof typeof OFFER_REASON_LABELS] ?? commandErrorText(out.error)
      setMessage(out.minimumSalary !== undefined ? `${reason} Ele aceitaria a partir de ${formatMoney(out.minimumSalary)}.` : reason)
    })
  }

  return (
    <Card title="Renovar contrato">
      <div className="mb-3">
        <div className="font-semibold">{playerName(player)}</div>
        <div className="text-xs text-slate-400">
          {POSITION_SHORT_LABELS[player.position]} · {player.age} anos · força {Math.round(playerOverall(player))} · contrato até {formatDate(player.contract.endDate)} · salário atual {formatMoney(player.contract.salary)}
        </div>
      </div>
      <label className="mb-3 block text-sm">
        Salário mensal (ele pede {formatMoney(demand)})
        <MoneyInput className="mt-1 min-h-12 w-full rounded-xl px-3" value={salary} onChange={setSalary} />
      </label>
      <label className="mb-3 block text-sm">
        Anos a mais
        <select className="mt-1 min-h-12 w-full rounded-xl px-3" value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((y) => (
            <option key={y} value={y}>{y} {y === 1 ? 'ano' : 'anos'}</option>
          ))}
        </select>
      </label>
      {message && <p className="mb-2 text-sm text-rose-300">{message}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit}>Propor renovação</Button>
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
      </div>
    </Card>
  )
}
