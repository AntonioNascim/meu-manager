import { useMemo, useState } from 'react'
import { FORMATION_IDS, getFormation } from '../../../engine/formations'
import { overallAt, playerOverall } from '../../../engine/overall'
import { changeFormation, swapPlayers } from '../../../engine/tacticEdit'
import type { Player, Position, Tactic } from '../../../engine/types'
import {
  LINEUP_SLOTS,
  deleteUserLineup,
  loadUserLineup,
  saveUserLineup,
  setUserTactic,
  squadOf,
  userTeam,
} from '../../../store/game'
import type { Game } from '../../../store/game'
import { updateGame } from '../../../store/gameStore'
import { getLive } from '../../../store/liveMatch'
import { StatusTags } from '../../components/PlayerDetail'
import { playerName } from '../../format'
import { PLAY_STYLE_LABELS, POSITION_SHORT_LABELS } from '../../labels'
import { pitchLayout } from '../../pitchLayout'
import { isUnavailable } from '../../squadSort'
import { ConditionBar, ConditionStrip, Eyebrow, Flag, Jersey, MoodIcon, Panel, ValueBadge } from '../../theme'

/** Nome curto para caber embaixo da camisa no campo. */
function shortName(p: Player): string {
  const name = playerName(p)
  const parts = name.split(' ')
  return parts.length > 1 && !p.nickname ? (parts[parts.length - 1] as string) : name
}

const outOfPosition = (p: Player, slot: Position) => p.position !== slot && !p.secondaryPositions.includes(slot)

function Token({ player, slot, captain, selected, colors, onTap }: { player: Player; slot: Position; captain: boolean; selected: boolean; colors: [string, string]; onTap: () => void }) {
  const value = overallAt(player, slot)
  const improvised = outOfPosition(player, slot)
  return (
    <button type="button" onClick={onTap} className="flex w-[3.9rem] flex-col items-center gap-0.5" aria-label={`${playerName(player)}, ${POSITION_SHORT_LABELS[slot]}`}>
      <span className={`relative rounded-full p-0.5 ${selected ? 'bg-white/90 ring-4 ring-white/60' : ''}`}>
        <Jersey team={{ colors }} size={38} />
        <span className="absolute -right-2 -top-1">
          <MoodIcon morale={player.condition.morale} size={18} />
        </span>
        {captain && <span className="absolute -left-2 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-300 text-[11px] font-extrabold text-bg ring-1 ring-black/30">C</span>}
        {isUnavailable(player) && <span className="absolute -bottom-0.5 -right-1 h-3 w-3 rounded-full bg-loss ring-2 ring-black/40" role="img" aria-label="Indisponível" />}
      </span>
      <span className="w-full truncate rounded bg-black/75 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{shortName(player)}</span>
      <span
        className={`rounded px-1.5 text-[11px] font-extrabold leading-[18px] tabular-nums text-bg ${improvised ? 'bg-violet-300 ring-1 ring-violet-100' : 'bg-white/90'}`}
        title={improvised ? 'Fora da posição natural' : undefined}
      >
        {POSITION_SHORT_LABELS[slot]} · {Math.round(value)}
      </span>
      <ConditionStrip fitness={player.condition.fitness} />
    </button>
  )
}

function Pitch({ tactic, players, colors, selectedId, onTap }: { tactic: Tactic; players: Map<string, Player>; colors: [string, string]; selectedId: string | null; onTap: (id: string) => void }) {
  const formation = getFormation(tactic.formationId)
  const points = useMemo(() => pitchLayout(tactic.formationId), [tactic.formationId])
  return (
    <div className="relative mx-auto aspect-[3/5.1] w-full max-w-md overflow-hidden rounded-2xl border border-emerald-950 bg-[#1d5a3a]">
      <div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgb(255_255_255/0.045)_0_12.5%,transparent_12.5%_25%)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 170" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.55">
          <rect x="4" y="4" width="92" height="162" />
          <line x1="4" y1="85" x2="96" y2="85" />
          <circle cx="50" cy="85" r="11" />
          <rect x="24" y="4" width="52" height="21" />
          <rect x="38" y="4" width="24" height="8" />
          <rect x="24" y="145" width="52" height="21" />
          <rect x="38" y="158" width="24" height="8" />
        </g>
      </svg>
      {tactic.startingXI.map((id, i) => {
        const player = players.get(id)
        const point = points[i]
        const slot = formation.slots[i]
        if (!player || !point || !slot) return null
        return (
          <div key={id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${point.x}%`, top: `${point.y}%` }}>
            <Token player={player} slot={slot.position} captain={tactic.captainId === id} selected={selectedId === id} colors={colors} onTap={() => onTap(id)} />
          </div>
        )
      })}
    </div>
  )
}

function ReserveRow({ player, selected, onTap }: { player: Player; selected: boolean; onTap: () => void }) {
  const overall = playerOverall(player)
  return (
    <li>
      <button type="button" onClick={onTap} className={`flex min-h-14 w-full items-center gap-2 px-3 py-1.5 text-left ${selected ? 'bg-white/10 ring-2 ring-inset ring-white/70' : ''} ${isUnavailable(player) ? 'opacity-75' : ''}`}>
        <span className="w-9 shrink-0 text-xs font-bold text-muted">{POSITION_SHORT_LABELS[player.position]}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Flag nationality={player.nationality} />
            <span className="truncate font-bold">{playerName(player)}</span>
          </span>
          <span className="flex flex-wrap gap-1">
            <StatusTags player={player} />
          </span>
        </span>
        <MoodIcon morale={player.condition.morale} size={20} />
        <ConditionBar fitness={player.condition.fitness} className="!h-6" />
        <ValueBadge value={overall} className="!min-w-10 !text-base">
          {Math.round(overall)}
        </ValueBadge>
      </button>
    </li>
  )
}

function SavedLineups({ game }: { game: Game }) {
  const [menu, setMenu] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const slots = Array.from({ length: LINEUP_SLOTS }, (_, i) => game.savedLineups?.[i] ?? null)
  const attempt = (change: (g: Game) => Game, done?: string) => {
    try {
      updateGame(change)
      setMessage(done ?? null)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível fazer isso')
    }
  }
  const name = (slot: number) => window.prompt('Nome da escalação:', slots[slot]?.name ?? `Escalação ${slot + 1}`)

  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Escalações salvas</Eyebrow>
        <span className="text-xs font-bold text-muted">
          {slots.filter(Boolean).length}/{LINEUP_SLOTS}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((saved, i) => (
          <div key={i} className="flex min-h-[4.5rem] overflow-hidden rounded-xl border border-line bg-surface-2">
            {saved ? (
              <>
                <button type="button" className="min-w-0 flex-1 px-2.5 py-2 text-left" onClick={() => attempt((g) => loadUserLineup(g, i), `${saved.name} carregada.`)}>
                  <span className="block truncate text-sm font-bold">{saved.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {saved.formationId} · {PLAY_STYLE_LABELS[saved.style]}
                  </span>
                </button>
                <button type="button" aria-label={`Opções de ${saved.name}`} className="w-8 shrink-0 text-lg font-bold text-muted" onClick={() => setMenu(menu === i ? null : i)}>
                  ⋯
                </button>
              </>
            ) : (
              <button
                type="button"
                className="flex-1 px-2.5 py-2 text-left text-muted"
                onClick={() => {
                  const n = name(i)
                  if (n !== null) attempt((g) => saveUserLineup(g, i, n), 'Escalação salva.')
                }}
              >
                <span className="block text-sm font-bold">+ Vazio</span>
                <span className="block text-[11px]">salvar a atual</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {menu !== null && slots[menu] && (
        <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold">
          <button type="button" className="min-h-10 rounded-lg border border-line bg-surface-2 px-3" onClick={() => { attempt((g) => saveUserLineup(g, menu, slots[menu]?.name ?? ''), 'Escalação atual guardada aqui.'); setMenu(null) }}>
            Guardar a atual aqui
          </button>
          <button type="button" className="min-h-10 rounded-lg border border-line bg-surface-2 px-3" onClick={() => { const n = name(menu); const saved = slots[menu]; if (n !== null && saved) attempt((g) => ({ ...g, savedLineups: slots.map((s, i) => (i === menu && s ? { ...s, name: n.trim() || s.name } : s)) })); setMenu(null) }}>
            Renomear
          </button>
          <button type="button" className="min-h-10 rounded-lg border border-loss/50 px-3 text-loss" onClick={() => { attempt((g) => deleteUserLineup(g, menu), 'Escalação excluída.'); setMenu(null) }}>
            Excluir
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-muted" role="status">{message}</p>}
    </Panel>
  )
}

/** Aba Escalação: formações do motor, campo com os titulares, banco e as 3 escalações salvas. É a mesma tática da tela de Tática. */
export function Lineup({ game }: { game: Game }) {
  const team = userTeam(game)
  const tactic = team.tactic
  const squad = squadOf(game, team.id)
  const byId = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = (change: (t: Tactic) => Tactic) => {
    try {
      updateGame((g) => setUserTactic(g, change(userTeam(g).tactic)))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar a mudança')
    }
  }

  const tap = (id: string) => {
    if (selectedId === null) setSelectedId(id)
    else if (selectedId === id) setSelectedId(null)
    else {
      const other = selectedId
      apply((t) => swapPlayers(t, other, id))
      setSelectedId(null)
    }
  }

  const bench = tactic.bench.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined)
  const rest = squad.filter((p) => !tactic.startingXI.includes(p.id) && !tactic.bench.includes(p.id)).sort((a, b) => playerOverall(b) - playerOverall(a))
  const selected = selectedId ? byId.get(selectedId) : undefined
  const matchStarted = game.pendingUserMatch !== undefined && (getLive(game.pendingUserMatch.id)?.match.minute ?? 0) > 0

  if (matchStarted) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-slate-300">A partida já começou. Durante o jogo, a tática, a formação e as substituições são feitas na aba Partida.</p>
      </Panel>
    )
  }

  return (
    <div className="space-y-3">
      <SavedLineups game={game} />

      <div>
        <div className="mb-2">
          <Eyebrow>Formações</Eyebrow>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FORMATION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tactic.formationId === id}
              onClick={() => apply((t) => changeFormation(t, squad, id))}
              className={`min-h-10 rounded-full border px-4 text-sm font-bold ${tactic.formationId === id ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-slate-100'}`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <p className="min-h-5 text-xs text-muted">
        {selected ? (
          <>
            <b className="text-white">{playerName(selected)}</b> selecionado: toque em outro jogador (do campo, do banco ou de fora do banco) para trocar de lugar.
          </>
        ) : (
          'Toque em um jogador e depois em outro para trocá-los de lugar.'
        )}
      </p>
      <Pitch tactic={tactic} players={byId} colors={team.colors} selectedId={selectedId} onTap={tap} />
      <p className="text-[11px] text-muted">Selo = posição da vaga e força nela · selo roxo = fora da posição natural · C capitão · barra = condição · carinha = moral</p>
      {error && <p className="rounded-xl border border-loss/40 bg-loss/10 p-2 text-sm text-loss">{error}</p>}

      <Panel className="overflow-hidden">
        <div className="px-3 pb-1 pt-3">
          <Eyebrow>Banco de reservas ({bench.length})</Eyebrow>
        </div>
        <ul className="divide-y divide-line">
          {bench.map((p) => (
            <ReserveRow key={p.id} player={p} selected={selectedId === p.id} onTap={() => tap(p.id)} />
          ))}
        </ul>
      </Panel>

      {rest.length > 0 && (
        <Panel className="overflow-hidden">
          <div className="px-3 pb-1 pt-3">
            <Eyebrow>Fora do banco ({rest.length})</Eyebrow>
          </div>
          <ul className="divide-y divide-line">
            {rest.map((p) => (
              <ReserveRow key={p.id} player={p} selected={selectedId === p.id} onTap={() => tap(p.id)} />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
