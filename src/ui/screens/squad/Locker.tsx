import { useMemo, useState } from 'react'
import { squadRoom } from '../../../engine/squadRoom'
import type { RoomRole } from '../../../engine/squadRoom'
import { setCaptain } from '../../../engine/tacticEdit'
import { squadOf, userTeam } from '../../../store/game'
import type { Game } from '../../../store/game'
import { perform } from '../../../store/actions'
import { playerName } from '../../format'
import { POSITION_SHORT_LABELS, ROOM_CHEMISTRY_LABELS, ROOM_COMPLAINT_LABELS, ROOM_ROLE_LABELS, commandErrorText } from '../../labels'
import { Avatar, Eyebrow, Flag, MoodIcon, Panel } from '../../theme'

const ROLE_ORDER: RoomRole[] = ['reference', 'respected', 'member', 'trial']

/**
 * Vestiário: moral do grupo, entrosamento, a faixa de capitão e a hierarquia do elenco (referências, respeitados, do grupo, em teste), com
 * quem reclama de salário ou de minutos. Só leitura, menos "Dar a braçadeira" (que muda o capitão da tática). Nada daqui mexe no jogo.
 */
export function Locker({ game }: { game: Game }) {
  const team = userTeam(game)
  const squad = squadOf(game, team.id)
  const room = useMemo(() => squadRoom(team, squad, team), [team, squad])
  const byId = new Map(squad.map((p) => [p.id, p]))
  const [message, setMessage] = useState<string | null>(null)
  const captain = byId.get(room.captainId)
  const give = (id: string) => {
    setMessage(null)
    try {
      void perform({ type: 'tactic', tactic: setCaptain(team.tactic, id) }).then((out) => {
        if (!out.ok) setMessage(commandErrorText(out.error))
      })
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível dar a braçadeira.')
    }
  }
  return (
    <div className="space-y-3" data-testid="locker">
      <Panel striped cut className="p-4">
        <Eyebrow>Vestiário</Eyebrow>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 px-1 py-2" data-testid="locker-morale">
            <div className="title text-2xl leading-tight">{Math.round(room.morale)}</div>
            <div className="text-[11px] text-muted">Moral do grupo</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-1 py-2" data-testid="locker-chemistry">
            <div className="title text-lg leading-tight">{ROOM_CHEMISTRY_LABELS[room.chemistry]}</div>
            <div className="text-[11px] text-muted">Entrosamento</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-1 py-2" data-testid="locker-complaints">
            <div className="title text-2xl leading-tight">{room.complaints}</div>
            <div className="text-[11px] text-muted">Reclamações</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          {room.lowMorale > 0 ? `${room.lowMorale} no elenco com a moral baixa. ` : ''}
          {captain ? (
            <>
              A faixa de capitão é de <b className="text-slate-200">{playerName(captain)}</b>.
            </>
          ) : null}{' '}
          Esta leitura é só informativa: não muda o resultado dos jogos.
        </p>
      </Panel>
      {message && (
        <p className="rounded-xl border border-loss/50 bg-loss/10 p-2.5 text-sm font-semibold text-loss" role="alert">
          {message}
        </p>
      )}
      {ROLE_ORDER.map((role) => {
        const rows = room.rows.filter((r) => r.role === role)
        if (rows.length === 0) return null
        return (
          <Panel key={role} className="overflow-hidden" data-testid="locker-group" data-role={role}>
            <div className="flex items-baseline justify-between px-4 pt-4">
              <Eyebrow>{ROOM_ROLE_LABELS[role].title}</Eyebrow>
              <span className="text-[11px] text-muted">{rows.length}</span>
            </div>
            <p className="px-4 text-[11px] text-muted">{ROOM_ROLE_LABELS[role].text}</p>
            <ul className="mt-2 divide-y divide-line">
              {rows.map((r) => {
                const p = byId.get(r.playerId)
                if (!p) return null
                return (
                  <li key={r.playerId} className="flex min-h-14 items-center gap-2 px-3 py-2 text-sm" data-testid="locker-row">
                    <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[p.position]}</span>
                    <Avatar id={p.id} colors={team.colors} size={30} ring />
                    <Flag nationality={p.nationality} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{playerName(p)}</span>
                        {r.captain && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-accent-ink">C</span>}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {p.age} anos · peso {r.weight}
                        {r.complaint ? <span className="font-bold text-amber"> · {ROOM_COMPLAINT_LABELS[r.complaint]}</span> : null}
                      </span>
                    </span>
                    <MoodIcon morale={r.morale} />
                    {!r.captain && r.starter && (role === 'reference' || role === 'respected') && (
                      <button type="button" onClick={() => give(r.playerId)} className="min-h-10 shrink-0 rounded-lg border border-line bg-surface px-2 text-[11px] font-bold active:scale-95" data-testid="give-armband">
                        Dar a braçadeira
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}
