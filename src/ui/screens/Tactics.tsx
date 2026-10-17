import { useMemo, useState } from 'react'
import { ForeignNote } from '../components/ForeignNote'
import { lineupForeign } from '../../engine/foreign'
import { FORMATION_IDS, formationOf } from '../../engine/formations'
import { shapeOf } from '../../engine/grid'
import { buildTactic } from '../../engine/lineup'
import { overallAt, playerOverall } from '../../engine/overall'
import { MAX_TAKERS, changeFormation, movePlayerTo, setCaptain, setTaker, swapPlayers } from '../../engine/tacticEdit'
import type { SetPieceKind } from '../../engine/tacticEdit'
import type { GridPoint, Mentality, Player, PlayStyle, Tactic } from '../../engine/types'
import { setUserTactic, squadOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { bandFor, conditionBand } from '../colors'
import { getLive } from '../../store/liveMatch'
import { StatusTags } from '../components/PlayerDetail'
import { Button, Card, Segmented } from '../components/ui'
import { playerName } from '../format'
import {
  MENTALITY_LABELS,
  PLAY_STYLE_DESCRIPTIONS,
  PLAY_STYLE_LABELS,
  POSITION_SHORT_LABELS,
  SET_PIECE_LABELS,
} from '../labels'
import { GridPitch } from '../components/GridPitch'

const STYLES: PlayStyle[] = ['possession', 'counter-attack', 'high-press']
const MENTALITIES: Mentality[] = [-2, -1, 0, 1, 2]

/** Nome curto para caber embaixo da camisa no campo. */
function shortName(p: Player): string {
  const name = playerName(p)
  const parts = name.split(' ')
  return parts.length > 1 && !p.nickname ? (parts[parts.length - 1] as string) : name
}

const unavailable = (p: Player) => p.condition.injuryDaysLeft > 0 || p.condition.suspensionGames > 0

function Token({ player, slot, tactic, selected }: { player: Player; slot: Player['position']; tactic: Tactic; selected: boolean }) {
  const value = overallAt(player, slot)
  const outOfPosition = player.position !== slot && !player.secondaryPositions.includes(slot)
  const badges = [
    tactic.captainId === player.id ? 'C' : null,
    tactic.penaltyTakerIds[0] === player.id ? 'P' : null,
    tactic.freeKickTakerIds[0] === player.id ? 'F' : null,
  ].filter(Boolean)
  return (
    <div className="flex w-16 flex-col items-center" aria-label={`${playerName(player)}, ${POSITION_SHORT_LABELS[slot]}`}>
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 bg-slate-900/90 text-sm font-bold tabular-nums ${bandFor(value).text} ${selected ? 'border-white ring-4 ring-emerald-300' : outOfPosition ? 'border-amber-400' : 'border-slate-500'}`}
      >
        {Math.round(value)}
        {unavailable(player) && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border border-slate-900 bg-rose-500" title="Indisponível" />}
        {badges.length > 0 && (
          <span className="absolute -bottom-1 -left-1 flex gap-0.5">
            {badges.map((b) => (
              <span key={b as string} className="rounded bg-sky-400 px-1 text-[9px] font-bold leading-4 text-slate-950">
                {b}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="mt-0.5 w-full truncate rounded bg-slate-950/60 px-1 text-center text-[10px] font-semibold leading-4">{shortName(player)}</span>
      <span className="text-[9px] leading-3 text-emerald-100/80">{POSITION_SHORT_LABELS[slot]}</span>
    </div>
  )
}

function Pitch({ tactic, players, selectedId, onTap, onMove }: { tactic: Tactic; players: Map<string, Player>; selectedId: string | null; onTap: (id: string) => void; onMove: (id: string, point: GridPoint) => void }) {
  return <GridPitch tactic={tactic} players={players} selectedId={selectedId} onTap={onTap} onMove={onMove} renderToken={(player, slot, selected) => <Token player={player} slot={slot} tactic={tactic} selected={selected} />} />
}

function ListRow({ player, selected, onTap, tag }: { player: Player; selected: boolean; onTap: () => void; tag?: string }) {
  const overall = playerOverall(player)
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className={`flex min-h-12 w-full items-center gap-2 px-3 py-1.5 text-left ${selected ? 'bg-emerald-600/30 ring-2 ring-inset ring-emerald-400' : ''} ${unavailable(player) ? 'opacity-70' : ''}`}
      >
        <span className="w-9 text-xs font-semibold text-slate-300">{POSITION_SHORT_LABELS[player.position]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{playerName(player)}</span>
          <span className="flex flex-wrap gap-1">
            <StatusTags player={player} />
          </span>
        </span>
        {tag && <span className="text-[10px] uppercase text-slate-500">{tag}</span>}
        <span className={`w-8 text-sm font-bold tabular-nums ${bandFor(overall).text}`}>{Math.round(overall)}</span>
        <span className={`w-8 text-sm tabular-nums ${conditionBand(player.condition.fitness).text}`}>{Math.round(player.condition.fitness)}</span>
      </button>
    </li>
  )
}

function PlayerSelect({ label, value, xi, onChange }: { label: string; value: string | undefined; xi: Player[]; onChange: (id: string) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm">
      <span className="w-24 shrink-0 text-slate-300">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="min-h-11 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-2 text-slate-100"
      >
        {value === undefined && <option value="">Escolher…</option>}
        {xi.map((p) => (
          <option key={p.id} value={p.id}>
            {playerName(p)} ({POSITION_SHORT_LABELS[p.position]})
          </option>
        ))}
      </select>
    </label>
  )
}

/** Tela de tática: campo, formação, estilo, mentalidade, capitão e cobradores; trocar titulares tocando nos jogadores. */
export function Tactics({ game }: { game: Game }) {
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

  const move = (id: string, point: GridPoint) => {
    apply((t) => movePlayerTo(t, id, point))
    setSelectedId(null)
  }

  const xi = tactic.startingXI.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined)
  const bench = tactic.bench.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined)
  const rest = squad.filter((p) => !tactic.startingXI.includes(p.id) && !tactic.bench.includes(p.id))
  const strength = xi.reduce((s, p, i) => s + overallAt(p, formationOf(tactic).slots[i]?.position ?? p.position), 0) / Math.max(1, xi.length)
  const unavailableStarters = xi.filter(unavailable)
  const selected = selectedId ? byId.get(selectedId) : undefined
  const matchStarted = game.pendingUserMatch !== undefined && (getLive(game.pendingUserMatch.id)?.match.minute ?? 0) > 0

  if (matchStarted) {
    return (
      <Card>
        <h1 className="text-lg font-bold">Tática</h1>
        <p className="mt-2 text-sm text-slate-300">A partida já começou. Durante o jogo, a tática, a formação e as substituições são feitas na aba Partida.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Tática</h1>
        <span className="text-xs text-slate-400">
          Força do time na formação: <b className={`text-base ${bandFor(strength).text}`}>{strength.toFixed(0)}</b>
        </span>
      </div>

      <Card title="Formação">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {FORMATION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => apply((t) => changeFormation(t, squad, id))}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold ${tactic.formationId === id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
            >
              {id}
            </button>
          ))}
          {tactic.formationId === 'custom' && (
            <span data-testid="free-chip" className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-slate-950">
              Livre · {shapeOf(formationOf(tactic).grid)}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">As formações são atalhos que já posicionam o time. Depois é só arrastar cada jogador para o ponto da grade que quiser.</p>
      </Card>

      {unavailableStarters.length > 0 && (
        <div className="rounded-xl bg-rose-900/60 p-3 text-sm text-rose-100">
          {unavailableStarters.map(playerName).join(', ')} {unavailableStarters.length > 1 ? 'estão indisponíveis' : 'está indisponível'}: {unavailableStarters.length > 1 ? 'serão trocados' : 'será trocado'} automaticamente pelo melhor reserva antes do jogo. Troque
          você mesmo se preferir.
        </div>
      )}

      <p className="min-h-5 text-xs text-slate-400">
        {selected ? (
          <>
            <b className="text-emerald-300">{playerName(selected)}</b> selecionado: toque em outro jogador (do campo, do banco ou das reservas) para trocar de lugar.
          </>
        ) : (
          'Arraste um jogador para o ponto que quiser, ou toque em um e depois em outro para trocá-los de lugar.'
        )}
      </p>
      <Pitch tactic={tactic} players={byId} selectedId={selectedId} onTap={tap} onMove={move} />
      <p className="text-[11px] text-slate-500">Número = força na vaga · borda laranja = improvisado · C capitão · P pênaltis · F faltas</p>
      <ForeignNote team={team} tactic={tactic} squad={squad} />
      {error && <p className="rounded-lg bg-rose-900/60 p-2 text-sm text-rose-100">{error}</p>}

      <Card title="Estilo de jogo">
        <Segmented
          value={tactic.style}
          options={STYLES.map((s) => ({ id: s, label: PLAY_STYLE_LABELS[s] }))}
          onChange={(style) => apply((t) => ({ ...t, style }))}
        />
        <p className="mt-2 text-xs text-slate-400">{PLAY_STYLE_DESCRIPTIONS[tactic.style]}</p>
      </Card>

      <Card title="Mentalidade">
        <Segmented value={tactic.mentality} options={MENTALITIES.map((m) => ({ id: m, label: MENTALITY_LABELS[m] }))} onChange={(mentality) => apply((t) => ({ ...t, mentality }))} />
      </Card>

      <Card title="Capitão e cobradores">
        <PlayerSelect label="Capitão" value={tactic.captainId} xi={xi} onChange={(id) => apply((t) => setCaptain(t, id))} />
        {(['penalty', 'free-kick'] as SetPieceKind[]).map((kind) =>
          Array.from({ length: MAX_TAKERS[kind] }, (_, rank) => (
            <PlayerSelect
              key={`${kind}${rank}`}
              label={`${SET_PIECE_LABELS[kind]} ${rank + 1}º`}
              value={(kind === 'penalty' ? tactic.penaltyTakerIds : tactic.freeKickTakerIds)[rank]}
              xi={xi}
              onChange={(id) => apply((t) => setTaker(t, kind, rank, id))}
            />
          )),
        )}
      </Card>

      <Card title={`Banco de reservas (${bench.length})`} flush>
        <ul className="divide-y divide-slate-700">
          {bench.map((p) => (
            <ListRow key={p.id} player={p} selected={selectedId === p.id} onTap={() => tap(p.id)} />
          ))}
        </ul>
      </Card>

      <Card title={`Fora do banco (${rest.length})`} flush>
        <ul className="divide-y divide-slate-700">
          {rest.map((p) => (
            <ListRow key={p.id} player={p} selected={selectedId === p.id} onTap={() => tap(p.id)} />
          ))}
        </ul>
      </Card>

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          apply((t) => buildTactic(squad, { formationId: t.formationId, grid: t.grid, style: t.style, mentality: t.mentality }, { rested: true, ...(lineupForeign(team) ? { foreign: lineupForeign(team) } : {}) }))
          setSelectedId(null)
        }}
      >
        Sugerir escalação automática
      </Button>
    </div>
  )
}
