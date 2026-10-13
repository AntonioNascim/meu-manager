import { useState } from 'react'
import type { Game } from '../../../store/game'
import { formatDate, playerName } from '../../format'
import { OFFER_KIND_LABELS } from '../../labels'
import { Flag, Panel, TopTabs } from '../../theme'
import { clubName, shortMoney } from './parts'

/** Histórico: transferências e empréstimos da temporada, só os seus ou os de todo o campeonato. */
export function History({ game }: { game: Game }) {
  const [scope, setScope] = useState<'all' | 'mine'>('mine')
  const players = new Map(game.season.players.map((p) => [p.id, p]))
  const records = game.season.market.history
    .filter((r) => scope === 'all' || r.toTeamId === game.userTeamId || r.fromTeamId === game.userTeamId)
    .slice()
    .reverse()

  return (
    <div className="space-y-3">
      <TopTabs
        value={scope}
        onChange={setScope}
        options={[
          { id: 'mine', label: 'Minhas' },
          { id: 'all', label: 'Do campeonato' },
        ]}
      />
      <Panel className="overflow-hidden">
        <ul className="divide-y divide-line">
          {records.map((r, i) => {
            const p = players.get(r.playerId)
            const mine = r.toTeamId === game.userTeamId ? 'text-win' : r.fromTeamId === game.userTeamId ? 'text-loss' : ''
            return (
              <li key={`${r.playerId}-${r.date}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {p && <Flag nationality={p.nationality} />}
                    <span className="truncate font-extrabold">{p ? playerName(p) : r.playerId}</span>
                    <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] font-bold text-muted">{r.kind === 'loan' ? OFFER_KIND_LABELS.loan : 'Transferência'}</span>
                  </div>
                  <div className={`truncate text-xs ${mine || 'text-muted'}`}>
                    {clubName(game, r.fromTeamId)} → {clubName(game, r.toTeamId)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-extrabold tabular-nums">{r.fee > 0 ? shortMoney(r.fee) : 'Grátis'}</div>
                  <div className="text-[11px] text-muted">{formatDate(r.date).replace(/^[^,]*, /, '')}</div>
                </div>
              </li>
            )
          })}
          {records.length === 0 && <li className="p-4 text-sm text-muted">{scope === 'mine' ? 'Você ainda não negociou jogadores nesta temporada.' : 'Ainda não houve transferências nesta temporada.'}</li>}
        </ul>
      </Panel>
    </div>
  )
}
