import { matchLabel } from '../../engine/cups'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FORMATION_IDS } from '../../engine/formations'
import { shapeOf } from '../../engine/grid'
import { playerOverall } from '../../engine/overall'
import type { MatchSnapshot, SideSnapshot } from '../../engine/match'
import type { GridPoint, MatchEvent, Mentality, Player, PlayStyle, Position } from '../../engine/types'
import { finishPendingMatch, teamById } from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { beginLive, clearLive, getLive } from '../../store/liveMatch'
import type { LiveSession } from '../../store/liveMatch'
import { bandFor, conditionBand } from '../colors'
import { FieldLineup } from '../components/FieldLineup'
import type { Kit } from '../components/FieldLineup'
import { OpponentOverlay } from '../components/OpponentOverlay'
import { Button, Card, Segmented, Tabs, TeamBadge } from '../components/ui'
import { formatDate, playerName } from '../format'
import {
  MATCH_EVENT_LABELS,
  MATCH_STAT_LABELS,
  MENTALITY_LABELS,
  PLAY_STYLE_DESCRIPTIONS,
  PLAY_STYLE_LABELS,
  POSITION_SHORT_LABELS,
} from '../labels'
import type { ScreenId } from '../navigation'
import { OtherGames } from './match/Others'
import { Pitch } from './match/Pitch'
import { assignNumber, devFlag, devParam, holdFor, inkFor, kitsFor } from './match/pitchModel'
import { Jersey } from '../theme'

const SPEEDS = [1, 2, 4, 8] as const
/** Duração de um minuto de jogo na velocidade 1x (ms). */
const MINUTE_MS = 700
const STYLES: PlayStyle[] = ['possession', 'counter-attack', 'high-press']
const MENTALITIES: Mentality[] = [-2, -1, 0, 1, 2]

const EVENT_ICON: Record<MatchEvent['type'], string> = {
  goal: '⚽',
  'own-goal': '⚽',
  'missed-penalty': '❌',
  'yellow-card': '🟨',
  'red-card': '🟥',
  injury: '✚',
  substitution: '⇄',
  corner: '⚑',
  foul: '•',
}

interface LogLine {
  key: string
  minute: number
  text: string
  icon: string
  label?: string
  teamId?: string
  strong: boolean
}

/** Narração ao vivo: lances do motor mais as marcações de início, intervalo e fim (mais recente em cima). */
export function buildLog(snap: MatchSnapshot, halftimeDone: boolean, showFouls = true): LogLine[] {
  const lines: LogLine[] = [{ key: 'start', minute: 0, text: 'Apita o árbitro: começa o jogo!', icon: '🏁', strong: false }]
  const events = snap.events.map((e, i) => ({ e, i })).filter(({ e }) => showFouls || e.type !== 'foul')
  const push = (e: MatchEvent, i: number) =>
    lines.push({
      key: `e${i}`,
      minute: e.minute,
      text: e.text,
      icon: EVENT_ICON[e.type],
      label: MATCH_EVENT_LABELS[e.type],
      teamId: e.teamId,
      strong: e.type === 'goal' || e.type === 'own-goal' || e.type === 'red-card',
    })
  for (const { e, i } of events.filter(({ e }) => e.minute <= 45)) push(e, i)
  if (halftimeDone || snap.minute > 45) lines.push({ key: 'half', minute: 45, text: 'Fim do primeiro tempo.', icon: '⏸', strong: false })
  for (const { e, i } of events.filter(({ e }) => e.minute > 45 && e.minute <= 90)) push(e, i)
  if (snap.extraTime) {
    lines.push({ key: 'regular-end', minute: 90, text: 'Fim do tempo normal: o confronto segue empatado. Vai para a prorrogação!', icon: '⏱', strong: true })
    for (const { e, i } of events.filter(({ e }) => e.minute > 90)) push(e, i)
  }
  if (snap.finished && snap.penalties) {
    for (const [i, kick] of (snap.shootout ?? []).entries()) {
      lines.push({ key: `pen${i}`, minute: snap.minute, text: `${kick.scored ? 'Gol' : 'Perdeu'}! Cobrança ${Math.floor(i / 2) + 1} (${kick.teamId === snap.home.teamId ? 'mandante' : 'visitante'}).`, icon: kick.scored ? '⚽' : '✖', strong: false, teamId: kick.teamId })
    }
    lines.push({ key: 'pens', minute: snap.minute, text: `Pênaltis: ${snap.penalties.home} x ${snap.penalties.away}.`, icon: '🥅', strong: true })
  }
  if (snap.finished) lines.push({ key: 'end', minute: snap.extraTime ? 120 : 90, text: `Fim de jogo! ${snap.homeGoals} x ${snap.awayGoals}${snap.penalties ? ` (${snap.penalties.home} x ${snap.penalties.away} nos pênaltis)` : ''}.`, icon: '🏁', strong: true })
  return lines.reverse()
}

/** Na volta de um confronto de ida e volta: o placar da ida e o que o time precisa. */
function FirstLegNote({ game, match }: { game: Game; match: NonNullable<Game['pendingUserMatch']> }) {
  const first = game.season.matches.find((m) => m.competitionId === match.competitionId && m.cup?.stage === match.cup?.stage && m.cup?.tie === match.cup?.tie && m.cup?.leg === 1)
  if (!first?.result) return null
  const home = teamById(game, first.homeTeamId)
  const away = teamById(game, first.awayTeamId)
  return (
    <p className="rounded-lg border border-line bg-surface p-2 text-xs text-muted" data-testid="first-leg">
      Jogo de ida: {home.name} {first.result.homeGoals} x {first.result.awayGoals} {away.name}. {game.season.cups?.find((c) => c.id === match.competitionId)?.spec.awayGoals ? 'Vale a regra do gol fora.' : 'Se a soma dos dois jogos empatar, vai para a prorrogação e os pênaltis.'}
    </p>
  )
}

function Scoreboard({ game, snap, label, speed, onSpeed, onOpponent }: { game: Game; snap: MatchSnapshot; label: string; speed: number; onSpeed: () => void; onOpponent: () => void }) {
  const home = teamById(game, snap.home.teamId)
  const away = teamById(game, snap.away.teamId)
  // O escudo do adversário abre a página dele (formação, estilo, mentalidade e escalação).
  const side = (team: typeof home) => {
    const content = (
      <>
        <TeamBadge team={team} />
        <span className="w-full truncate text-xs font-semibold">{team.name}</span>
      </>
    )
    const cls = 'flex min-w-0 flex-1 flex-col items-center gap-1 text-center'
    return team.id === game.userTeamId ? (
      <div className={cls}>{content}</div>
    ) : (
      <button type="button" onClick={onOpponent} aria-label={`Ver a tática de ${team.name}`} data-testid="opponent-crest" className={`${cls} rounded-lg active:bg-white/5`}>
        {content}
      </button>
    )
  }
  return (
    <div className="relative rounded-xl bg-slate-800 p-3 shadow">
      <button type="button" onClick={onSpeed} aria-label={`Velocidade ${speed}x. Toque para mudar`} data-testid="speed" className="absolute right-2 top-2 z-10 min-h-7 min-w-10 rounded-full border border-line bg-bg/70 px-2 text-xs font-extrabold tabular-nums text-accent">
        {speed}x
      </button>
      <div className="flex items-center justify-between gap-2">
        {side(home)}
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">
            {snap.homeGoals} x {snap.awayGoals}
          </div>
          {snap.penalties && snap.finished && <div className="text-xs font-bold tabular-nums text-amber-300">({snap.penalties.home} x {snap.penalties.away} nos pênaltis)</div>}
          <div className="text-xs font-semibold text-emerald-400">{label}</div>
        </div>
        {side(away)}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-700">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(snap.minute / (snap.extraTime ? 120 : 90)) * 100}%` }} />
      </div>
    </div>
  )
}

function LogList({ game, lines, showFouls, onToggleFouls }: { game: Game; lines: LogLine[]; showFouls: boolean; onToggleFouls: () => void }) {
  return (
    <>
    <label className="mb-2 flex items-center gap-2 text-xs text-slate-400">
      <input type="checkbox" checked={showFouls} onChange={onToggleFouls} className="h-4 w-4" />
      Mostrar faltas
    </label>
    <ul className="divide-y divide-slate-700/60 rounded-xl bg-slate-800">
      {lines.map((l) => {
        const team = l.teamId ? teamById(game, l.teamId) : undefined
        return (
          <li key={l.key} className={`flex items-start gap-2 px-3 py-2 text-sm ${l.strong ? 'bg-emerald-900/30 font-semibold' : ''}`}>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-400">{l.minute}&apos;</span>
            <span className="w-5 shrink-0 text-center" title={l.label} aria-label={l.label}>
              {l.icon}
            </span>
            <span className="flex-1">{l.text}</span>
            {team && <TeamBadge team={team} size="sm" />}
          </li>
        )
      })}
    </ul>
    </>
  )
}

function StatsList({ game, snap }: { game: Game; snap: MatchSnapshot }) {
  const keys = Object.keys(MATCH_STAT_LABELS) as (keyof typeof MATCH_STAT_LABELS)[]
  return (
    <div className="space-y-3 rounded-xl bg-slate-800 p-4">
      <div className="flex justify-between text-xs font-semibold text-slate-300">
        <span>{teamById(game, snap.home.teamId).name}</span>
        <span>{teamById(game, snap.away.teamId).name}</span>
      </div>
      {keys.map((k) => {
        const h = snap.homeStats[k]
        const a = snap.awayStats[k]
        const total = h + a
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold tabular-nums">{h}</span>
              <span className="text-xs text-slate-400">{MATCH_STAT_LABELS[k]}</span>
              <span className="font-bold tabular-nums">{a}</span>
            </div>
            <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <div className="bg-emerald-500" style={{ width: `${total === 0 ? 50 : (h / total) * 100}%` }} />
              <div className="bg-sky-500" style={{ width: `${total === 0 ? 50 : (a / total) * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TacticPanel({
  game,
  live,
  side,
  snap,
  canEdit,
  refresh,
  kit,
  keeperKit,
  numbers,
}: {
  game: Game
  live: LiveSession
  side: SideSnapshot
  snap: MatchSnapshot
  canEdit: boolean
  refresh: () => void
  kit: Kit
  keeperKit: Kit
  numbers: Map<string, number>
}) {
  const [error, setError] = useState<string | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const players = useMemo(() => new Map(game.season.players.map((p) => [p.id, p])), [game.season.players])
  const fitness = new Map(side.onPitch.map((p) => [p.playerId, p.fitness]))
  const yellow = new Map(side.onPitch.map((p) => [p.playerId, p.yellowCards > 0]))
  const act = (change: () => void) => {
    try {
      change()
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível mudar')
    }
  }
  const pitchCount = side.onPitch.length
  const move = (id: string, point: GridPoint) => {
    act(() => live.match.setPosition(live.side, id, point))
    setPickedId(null)
  }
  const tapPlayer = (id: string) => {
    if (!pickedId || pickedId === id) {
      setPickedId(pickedId === id ? null : id)
      return
    }
    const target = side.onPitch.find((p) => p.playerId === id)?.point
    if (target) move(pickedId, target)
  }
  return (
    <div className={`space-y-3 ${canEdit ? '' : 'pointer-events-none opacity-60'}`}>
      {!canEdit && <p className="pointer-events-auto rounded-lg bg-slate-800 p-2 text-xs text-slate-300">Pause o jogo para mexer na tática.</p>}
      <Card title="Formação">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {FORMATION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => act(() => live.match.setFormation(live.side, id))}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold ${side.formationId === id ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
            >
              {id}
            </button>
          ))}
          {side.formationId === 'custom' && (
            <span className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-slate-950">Livre · {shapeOf(side.grid)}</span>
          )}
        </div>
        {pitchCount !== 11 && <p className="mt-1 text-xs text-amber-300">A formação só muda com 11 jogadores em campo.</p>}
      </Card>
      <Card title="Posição dos jogadores">
        {pitchCount > 0 ? (
          <FieldLineup
            formationId={side.formationId}
            lineup={side.onPitch.map((p) => ({ playerId: p.playerId, slot: p.slot, point: p.point }))}
            players={players}
            kit={kit}
            keeperKit={keeperKit}
            numberOf={(id, slot) => assignNumber(numbers, live.side, id, slot)}
            fitnessOf={(id) => fitness.get(id) ?? 0}
            yellowOf={(id) => yellow.get(id) ?? false}
            selectedId={pickedId}
            onTap={tapPlayer}
            onMove={move}
          />
        ) : (
          <p className="text-xs text-amber-300">Não há jogadores em campo.</p>
        )}
        <p className="mt-2 text-[11px] text-muted">Arraste um jogador para o ponto que quiser, ou toque em dois para trocá-los de lugar. Vale a partir do próximo lance.{pitchCount < 11 && ' Com menos de 11, os lugares vazios custam: cubra as linhas e as faixas que ficaram sem gente.'}</p>
      </Card>
      <Card title="Estilo de jogo">
        <Segmented value={side.style} options={STYLES.map((s) => ({ id: s, label: PLAY_STYLE_LABELS[s] }))} onChange={(s) => act(() => live.match.setStyle(live.side, s))} />
        <p className="mt-2 text-xs text-slate-400">{PLAY_STYLE_DESCRIPTIONS[side.style]}</p>
      </Card>
      <Card title="Mentalidade">
        <Segmented value={side.mentality} options={MENTALITIES.map((m) => ({ id: m, label: MENTALITY_LABELS[m] }))} onChange={(m) => act(() => live.match.setMentality(live.side, m))} />
      </Card>
      {error && <p className="rounded-lg bg-rose-900/60 p-2 text-sm text-rose-100">{error}</p>}
      <p className="text-[11px] text-slate-500">Placar atual: {snap.homeGoals} x {snap.awayGoals}. As mudanças valem a partir do próximo lance.</p>
    </div>
  )
}

function SubsPanel({
  game,
  live,
  side,
  canEdit,
  refresh,
  injuredId,
  kit,
  keeperKit,
  numbers,
}: {
  game: Game
  live: LiveSession
  side: SideSnapshot
  canEdit: boolean
  refresh: () => void
  injuredId?: string
  kit: Kit
  keeperKit: Kit
  numbers: Map<string, number>
}) {
  const players = useMemo(() => new Map(game.season.players.map((p) => [p.id, p])), [game.season.players])
  const [outId, setOutId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const get = (id: string) => players.get(id) as Player
  const sideKey = live.side
  const numberOf = (id: string, slot: Position) => assignNumber(numbers, sideKey, id, slot)
  const fitness = new Map(side.onPitch.map((p) => [p.playerId, p.fitness]))
  const yellow = new Map(side.onPitch.map((p) => [p.playerId, p.yellowCards > 0]))
  const noSubs = side.subsLeft <= 0
  const noStops = side.stopsLeft <= 0

  const chooseIn = (inId: string) => {
    if (injuredId) {
      try {
        live.match.resolveInjury(live.side, inId)
        setMessage(`${playerName(get(inId))} entra no lugar de ${playerName(get(injuredId))}.`)
        refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Não foi possível substituir')
      }
      return
    }
    if (!outId) {
      setMessage('Escolha primeiro quem sai (toque num titular no campo).')
      return
    }
    try {
      live.match.substitute(live.side, outId, inId)
      setMessage(`${playerName(get(inId))} entra no lugar de ${playerName(get(outId))}.`)
      setOutId(null)
      refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível substituir')
    }
  }

  return (
    <div className={`space-y-3 ${canEdit ? '' : 'pointer-events-none opacity-60'}`}>
      {!canEdit && <p className="pointer-events-auto rounded-lg bg-slate-800 p-2 text-xs text-slate-300">Pause o jogo para fazer substituições.</p>}
      {injuredId && (
        <div className="pointer-events-auto space-y-2 rounded-xl border border-amber-400/60 bg-amber-950/50 p-3">
          <p className="text-sm font-bold text-amber-100">✚ {playerName(get(injuredId))} se machucou. Toque em quem entra no lugar dele, no banco abaixo.</p>
          <button
            type="button"
            onClick={() => {
              live.match.resolveInjury(live.side)
              setMessage('O time segue com um a menos.')
              refresh()
            }}
            className="min-h-10 w-full rounded-lg border border-line bg-surface text-sm font-bold"
          >
            Seguir com um a menos
          </button>
        </div>
      )}
      <p className="text-sm">
        Substituições restantes: <b>{side.subsLeft}</b> · Paradas além do intervalo: <b>{side.stopsLeft}</b>
      </p>
      <p className="text-[11px] text-slate-500">Máximo de 5 trocas em até 3 paradas além do intervalo. Várias trocas na mesma parada contam uma só. Toque em quem sai e depois em quem entra.</p>
      {(noSubs || noStops) && !injuredId && (
        <p className="rounded-lg border border-amber-400/50 bg-amber-950/40 p-2 text-xs font-semibold text-amber-100">
          {noSubs ? 'Acabaram as 5 trocas: se alguém se machucar, o time fica com um a menos.' : 'As 3 paradas já foram usadas: só dá para trocar numa parada já aberta neste minuto. Se alguém se machucar, o time fica com um a menos.'}
        </p>
      )}
      <Card title="Em campo (toque em quem sai, arraste para mudar de posição)">
        <FieldLineup
          formationId={side.formationId}
          lineup={side.onPitch.map((p) => ({ playerId: p.playerId, slot: p.slot, point: p.point }))}
          players={players}
          kit={kit}
          keeperKit={keeperKit}
          numberOf={numberOf}
          fitnessOf={(id) => fitness.get(id) ?? 0}
          yellowOf={(id) => yellow.get(id) ?? false}
          selectedId={outId}
          onMove={(id, point) => {
            try {
              live.match.setPosition(live.side, id, point)
              setMessage(null)
              refresh()
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Não foi possível mudar de posição')
            }
          }}
          onTap={(id) => {
            if (injuredId) {
              setMessage('Escolha quem entra no lugar de quem se machucou (banco abaixo).')
              return
            }
            setOutId(outId === id ? null : id)
          }}
        />
        {outId && !injuredId && (
          <p className="mt-2 text-center text-sm font-semibold text-rose-200">
            Sai: {playerName(get(outId))}. Agora toque em quem entra, no banco.
          </p>
        )}
      </Card>
      <Card title="Banco (toque em quem entra)" flush>
        <ul className="divide-y divide-slate-700">
          {side.bench.map((id) => {
            const player = get(id)
            const overall = playerOverall(player)
            return (
              <li key={id}>
                <button type="button" onClick={() => chooseIn(id)} disabled={side.subsLeft <= 0} className="flex min-h-14 w-full items-center gap-2 px-3 text-left disabled:opacity-40">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                    <span className="relative">
                      <Jersey team={{ colors: [kit.shirt, kit.trim] }} size={34} />
                      <span className="absolute inset-x-0 top-[44%] -translate-y-1/2 text-center font-display text-[12px] font-extrabold leading-none" style={{ color: inkFor(kit.shirt) }}>
                        {numberOf(id, player.position)}
                      </span>
                    </span>
                  </span>
                  <span className="w-9 text-xs font-semibold text-slate-300">{POSITION_SHORT_LABELS[player.position]}</span>
                  <span className="flex-1 truncate text-sm font-semibold">{playerName(player)}</span>
                  <span className={`w-8 text-sm font-bold tabular-nums ${bandFor(overall).text}`}>{Math.round(overall)}</span>
                  <span className={`w-10 text-right text-sm tabular-nums ${conditionBand(player.condition.fitness).text}`}>{Math.round(player.condition.fitness)}%</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
      {message && <p className="rounded-lg bg-slate-800 p-2 text-sm text-slate-200">{message}</p>}
    </div>
  )
}

type LiveTab = 'games' | 'stats' | 'tactics' | 'subs'

/** Tela larga (computador): os lances ficam numa coluna ao lado, como na referência. */
function useDesktop(): boolean {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const on = () => setWide(media.matches)
    media.addEventListener('change', on)
    return () => media.removeEventListener('change', on)
  }, [])
  return wide
}

/** Botões de controle do jogo (pequenos e do mesmo tamanho): mudam conforme o momento da partida. */
function Controls({ label, onMain, onSkip, mainDisabled }: { label: string; onMain: () => void; onSkip: () => void; mainDisabled: boolean }) {
  const base = 'min-h-10 flex-1 rounded-lg px-3 text-sm font-bold disabled:opacity-40'
  return (
    <div className="flex gap-2" role="group" aria-label="Controle do jogo">
      <button type="button" onClick={onMain} disabled={mainDisabled} className={`${base} bg-accent text-accent-ink`}>
        {label}
      </button>
      <button type="button" onClick={onSkip} className={`${base} border border-line bg-surface text-slate-100`}>
        Ir ao fim
      </button>
    </div>
  )
}

const CHOOSE_ALERT = 'Escolha quem entra'

function LiveView({ game, live, onNavigate }: { game: Game; live: LiveSession; onNavigate: (s: ScreenId) => void }) {
  const [snap, setSnap] = useState(() => live.match.snapshot())
  // (em desenvolvimento, &iniciar=1 já começa com o jogo rodando)
  const [running, setRunning] = useState(() => devFlag('iniciar'))
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2)
  const desktop = useDesktop()
  const names = useMemo(() => new Map(game.season.players.map((p) => [p.id, p])), [game.season.players])
  // Se a partida está parada por uma lesão (ao voltar para a tela, por exemplo), as Trocas já abrem com o aviso.
  const hurtAtOpen = snap.injuryPending?.side === live.side ? snap.injuryPending.playerId : undefined
  const [tab, setTab] = useState<LiveTab>(hurtAtOpen || devParam('aba') === 'trocas' ? 'subs' : devParam('aba') === 'tatica' ? 'tactics' : 'games')
  const [alert, setAlert] = useState<string | null>(() => (hurtAtOpen ? `${names.get(hurtAtOpen) ? playerName(names.get(hurtAtOpen) as Player) : 'Um jogador'} se machucou. ${CHOOSE_ALERT} na aba Trocas.` : null))
  const [showFouls, setShowFouls] = useState(false)
  // Quanto da partida a tela já viu: só o que chega depois pede câmera lenta ou aviso.
  const seen = useRef({ trace: snap.trace.length, events: snap.events.length })
  // Números de camisa dos dois times: o campo e as Trocas usam os mesmos.
  const numbers = useRef(new Map<string, number>())
  const [opponentOpen, setOpponentOpen] = useState(() => devFlag('oponente'))
  const homeTeam = teamById(game, snap.home.teamId)
  const awayTeam = teamById(game, snap.away.teamId)
  const kits = useMemo(() => kitsFor(homeTeam.colors, awayTeam.colors), [homeTeam.colors, awayTeam.colors])

  /** Guarda o novo estado, avisa de lesão no seu time e devolve quanto o relógio espera (câmera lenta). */
  const absorb = (next: MatchSnapshot): number => {
    const freshTrace = next.trace.slice(seen.current.trace)
    const freshEvents = next.events.slice(seen.current.events)
    seen.current = { trace: next.trace.length, events: next.events.length }
    setSnap(next)
    const hurt = freshEvents.find((e) => e.type === 'injury' && e.teamId === game.userTeamId)
    if (hurt) {
      const who = names.get(hurt.playerId)
      const name = who ? playerName(who) : 'Um jogador'
      setRunning(false)
      setTab('subs')
      setAlert(next.injuryPending ? `${name} se machucou. ${CHOOSE_ALERT} na aba Trocas.` : `${name} se machucou e não há mais trocas disponíveis: o time vai ficar com um a menos.`)
      return 0
    }
    return holdFor(freshTrace, freshEvents)
  }
  const refresh = () => {
    const next = live.match.snapshot()
    setSnap(next)
    if (!next.injuryPending) setAlert((a) => (a && a.includes(CHOOSE_ALERT) ? null : a))
  }

  useEffect(() => {
    if (!running) return
    let timer = 0
    const step = () => {
      const match = live.match
      match.playUntil(match.minute + 1)
      const hold = absorb(match.snapshot())
      if (match.finished) {
        setRunning(false)
        return
      }
      if (match.minute >= 45 && !live.halftimeDone) {
        live.halftimeDone = true
        setRunning(false)
        return
      }
      // Mata-mata empatado: pausa no fim dos 90 minutos antes da prorrogação.
      if (match.minute >= 90 && !live.extraDone) {
        live.extraDone = true
        setRunning(false)
        return
      }
      if (match.snapshot().injuryPending) return
      timer = window.setTimeout(step, MINUTE_MS / speed + hold)
    }
    timer = window.setTimeout(step, MINUTE_MS / speed)
    return () => window.clearTimeout(timer)
  }, [running, speed, live]) // eslint-disable-line react-hooks/exhaustive-deps

  const finished = snap.finished
  const pending = snap.injuryPending?.side === live.side
  const atHalftime = !finished && !running && snap.minute === 45 && live.halftimeDone
  const beforeExtra = !finished && !running && snap.minute === 90 && snap.extraTime === true
  const label = finished ? 'Fim de jogo' : atHalftime ? 'Intervalo' : beforeExtra ? 'Fim do tempo normal' : snap.minute === 0 ? 'Antes do apito' : `${snap.minute}'${snap.minute > 90 ? ' · prorrogação' : ''}${running ? '' : ' · pausado'}`
  const lines = useMemo(() => buildLog(snap, live.halftimeDone, showFouls), [snap, live.halftimeDone, showFouls])
  const mySide = live.side === 'home' ? snap.home : snap.away
  const opponentSide = live.side === 'home' ? snap.away : snap.home
  const canEdit = !running && !finished
  const mainLabel = running ? 'Pausar' : atHalftime ? 'Começar o 2º tempo' : beforeExtra ? 'Começar a prorrogação' : snap.minute === 0 ? 'Começar' : 'Continuar'
  const nextSpeed = () => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] as (typeof SPEEDS)[number])

  const onMain = () => {
    if (!running) setAlert((a) => (a && !a.includes(CHOOSE_ALERT) ? null : a))
    setRunning((r) => !r)
  }
  const skip = () => {
    live.halftimeDone = true
    live.extraDone = true
    setRunning(false)
    live.match.playUntil(120)
    absorb(live.match.snapshot())
  }

  const conclude = () => {
    const result = live.match.result()
    clearLive()
    updateGame((g) => finishPendingMatch(g, result))
    onNavigate('home')
  }

  const adjust = () => {
    clearLive()
    onNavigate('tactics')
  }

  const logSection = (
    <section aria-label="Lances ao vivo">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Lances ao vivo</h2>
      <LogList game={game} lines={lines} showFouls={showFouls} onToggleFouls={() => setShowFouls((v) => !v)} />
    </section>
  )

  const match = game.pendingUserMatch
  return (
    <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-4 lg:space-y-0">
      <div className="space-y-3">
        <div className="sticky top-[57px] z-10 -mx-4 bg-slate-900/95 px-4 pb-2 pt-1 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:p-0">
          <Scoreboard game={game} snap={snap} label={label} speed={speed} onSpeed={nextSpeed} onOpponent={() => setOpponentOpen(true)} />
        </div>

        {finished ? (
          <Button className="w-full text-lg" onClick={conclude}>
            Concluir partida
          </Button>
        ) : (
          <Controls label={mainLabel} onMain={onMain} onSkip={skip} mainDisabled={pending} />
        )}
        {snap.minute === 0 && match && (
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {matchLabel(game.season, match).competition} · {matchLabel(game.season, match).detail} · {formatDate(match.date)} · {match.cup?.neutral ? 'campo neutro' : teamById(game, match.homeTeamId).stadium.name}
            </span>
            <button type="button" onClick={adjust} className="font-bold text-accent underline">
              Ajustar tática e escalação
            </button>
          </p>
        )}
        {snap.minute === 0 && match?.cup?.leg === 2 && <FirstLegNote game={game} match={match} />}
        {alert && (
          <p role="alert" className="rounded-lg border border-amber-400/60 bg-amber-950/60 p-2 text-sm font-semibold text-amber-100">
            ✚ {alert}
          </p>
        )}

        <Pitch game={game} snap={snap} speed={speed} running={running} numbers={numbers.current} />

        <Tabs
          value={tab}
          options={[
            { id: 'games' as LiveTab, label: 'Jogos' },
            { id: 'stats' as LiveTab, label: 'Dados' },
            { id: 'tactics' as LiveTab, label: 'Tática' },
            { id: 'subs' as LiveTab, label: 'Trocas' },
          ]}
          onChange={setTab}
        />

        {tab === 'games' && <OtherGames game={game} minute={snap.minute} />}
        {tab === 'stats' && <StatsList game={game} snap={snap} />}
        {tab === 'tactics' && <TacticPanel game={game} live={live} side={mySide} snap={snap} canEdit={canEdit} refresh={refresh} kit={kits[live.side]} keeperKit={{ shirt: kits[live.side].keeper, trim: kits[live.side].shirt }} numbers={numbers.current} />}
        {tab === 'subs' && <SubsPanel game={game} live={live} side={mySide} canEdit={canEdit} refresh={refresh} injuredId={pending ? snap.injuryPending?.playerId : undefined} kit={kits[live.side]} keeperKit={{ shirt: kits[live.side].keeper, trim: kits[live.side].shirt }} numbers={numbers.current} />}

        {!desktop && <div className="max-h-[28rem] overflow-y-auto">{logSection}</div>}
      </div>

      {opponentOpen && <OpponentOverlay game={game} teamId={opponentSide.teamId} live={{ teamId: opponentSide.teamId, formationId: opponentSide.formationId, style: opponentSide.style, mentality: opponentSide.mentality, activeMentality: opponentSide.activeMentality, onPitch: opponentSide.onPitch }} onClose={() => setOpponentOpen(false)} />}

      {desktop && <aside className="max-h-[calc(100dvh-140px)] overflow-y-auto lg:sticky lg:top-16">{logSection}</aside>}
    </div>
  )
}

/** Tela de partida: placar com velocidade, campo, controles, abas (Jogos, Dados, Tática, Trocas) e a lista de lances. */
export function MatchScreen({ game, onNavigate }: { game: Game; onNavigate: (s: ScreenId) => void }) {
  const pending = game.pendingUserMatch
  // Ao abrir, uma partida que ainda não começou é refeita com a escalação de agora (ela pode ter mudado na tela de tática).
  useState(() => {
    const open = pending ? getLive(pending.id) : null
    if (open && open.match.minute === 0) clearLive()
    return true
  })
  if (!pending) {
    return (
      <Card>
        <p className="text-slate-300">Não há partida do seu time agora. Volte ao painel e toque em Avançar.</p>
        <Button className="mt-3 w-full" onClick={() => onNavigate('home')}>
          Ir ao painel
        </Button>
      </Card>
    )
  }
  const live = getLive(pending.id) ?? beginLive(game, true)
  return <LiveView key={pending.id} game={game} live={live} onNavigate={onNavigate} />
}
