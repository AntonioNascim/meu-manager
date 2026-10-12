import { useEffect, useMemo, useState } from 'react'
import { FORMATION_IDS } from '../../engine/formations'
import { playerOverall } from '../../engine/overall'
import type { MatchSnapshot, SideSnapshot } from '../../engine/match'
import type { MatchEvent, Mentality, Player, PlayStyle } from '../../engine/types'
import { finishPendingMatch, teamById, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { updateGame } from '../../store/gameStore'
import { beginLive, clearLive, getLive } from '../../store/liveMatch'
import type { LiveSession } from '../../store/liveMatch'
import { bandFor, conditionBand } from '../colors'
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
  for (const { e, i } of events.filter(({ e }) => e.minute > 45)) push(e, i)
  if (snap.finished) lines.push({ key: 'end', minute: 90, text: `Fim de jogo! ${snap.homeGoals} x ${snap.awayGoals}.`, icon: '🏁', strong: true })
  return lines.reverse()
}

function Scoreboard({ game, snap, label }: { game: Game; snap: MatchSnapshot; label: string }) {
  const home = teamById(game, snap.home.teamId)
  const away = teamById(game, snap.away.teamId)
  return (
    <div className="rounded-xl bg-slate-800 p-3 shadow">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          <TeamBadge team={home} />
          <span className="w-full truncate text-xs font-semibold">{home.name}</span>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">
            {snap.homeGoals} x {snap.awayGoals}
          </div>
          <div className="text-xs font-semibold text-emerald-400">{label}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          <TeamBadge team={away} />
          <span className="w-full truncate text-xs font-semibold">{away.name}</span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-700">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(snap.minute / 90) * 100}%` }} />
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

function TacticPanel({ live, side, snap, canEdit, refresh }: { live: LiveSession; side: SideSnapshot; snap: MatchSnapshot; canEdit: boolean; refresh: () => void }) {
  const [error, setError] = useState<string | null>(null)
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
        </div>
        {pitchCount !== 11 && <p className="mt-1 text-xs text-amber-300">A formação só muda com 11 jogadores em campo.</p>}
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

function SubsPanel({ game, live, side, canEdit, refresh }: { game: Game; live: LiveSession; side: SideSnapshot; canEdit: boolean; refresh: () => void }) {
  const players = useMemo(() => new Map(game.season.players.map((p) => [p.id, p])), [game.season.players])
  const [outId, setOutId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const get = (id: string) => players.get(id) as Player

  const chooseIn = (inId: string) => {
    if (!outId) {
      setMessage('Escolha primeiro quem sai (lista de cima).')
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
      <p className="text-sm">
        Substituições restantes: <b>{side.subsLeft}</b>
      </p>
      <Card title="Em campo (toque em quem sai)" flush>
        <ul className="divide-y divide-slate-700">
          {side.onPitch.map((p) => {
            const player = get(p.playerId)
            return (
              <li key={p.playerId}>
                <button type="button" onClick={() => setOutId(outId === p.playerId ? null : p.playerId)} className={`flex min-h-12 w-full items-center gap-2 px-3 text-left ${outId === p.playerId ? 'bg-rose-900/40 ring-2 ring-inset ring-rose-400' : ''}`}>
                  <span className="w-9 text-xs font-semibold text-slate-300">{POSITION_SHORT_LABELS[p.slot]}</span>
                  <span className="flex-1 truncate text-sm font-semibold">{playerName(player)}</span>
                  {p.yellowCards > 0 && <span title="Amarelo">🟨</span>}
                  <span className={`w-10 text-right text-sm tabular-nums ${conditionBand(p.fitness).text}`}>{p.fitness}%</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
      <Card title="Banco (toque em quem entra)" flush>
        <ul className="divide-y divide-slate-700">
          {side.bench.map((id) => {
            const player = get(id)
            const overall = playerOverall(player)
            return (
              <li key={id}>
                <button type="button" onClick={() => chooseIn(id)} disabled={side.subsLeft <= 0} className="flex min-h-12 w-full items-center gap-2 px-3 text-left disabled:opacity-40">
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

type LiveTab = 'log' | 'stats' | 'tactics' | 'subs'

function LiveView({ game, live, autoStart, onNavigate }: { game: Game; live: LiveSession; autoStart: boolean; onNavigate: (s: ScreenId) => void }) {
  const [snap, setSnap] = useState(() => live.match.snapshot())
  const [running, setRunning] = useState(autoStart)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2)
  const [tab, setTab] = useState<LiveTab>('log')
  const refresh = () => setSnap(live.match.snapshot())

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const match = live.match
      match.playUntil(match.minute + 1)
      setSnap(match.snapshot())
      if (match.finished) setRunning(false)
      else if (match.minute >= 45 && !live.halftimeDone) {
        live.halftimeDone = true
        setRunning(false)
      }
    }, MINUTE_MS / speed)
    return () => clearInterval(timer)
  }, [running, speed, live])

  const finished = snap.finished
  const atHalftime = !finished && !running && snap.minute === 45
  const beforeHalftime = !live.halftimeDone && snap.minute < 45
  const label = finished ? 'Fim de jogo' : atHalftime ? 'Intervalo' : snap.minute === 0 ? 'Antes do apito' : `${snap.minute}'${running ? '' : ' · pausado'}`
  const [showFouls, setShowFouls] = useState(false)
  const lines = useMemo(() => buildLog(snap, live.halftimeDone, showFouls), [snap, live.halftimeDone, showFouls])
  const mySide = live.side === 'home' ? snap.home : snap.away
  const canEdit = !running && !finished

  const skip = () => {
    if (beforeHalftime) {
      live.match.playUntil(45)
      live.halftimeDone = true
    } else live.match.playUntil(90)
    setRunning(false)
    refresh()
  }

  const conclude = () => {
    const result = live.match.result()
    clearLive()
    updateGame((g) => finishPendingMatch(g, result))
    onNavigate('home')
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-[57px] z-10 -mx-4 bg-slate-900/95 px-4 pb-2 pt-1 backdrop-blur">
        <Scoreboard game={game} snap={snap} label={label} />
      </div>

      {finished ? (
        <Button className="w-full text-lg" onClick={conclude}>
          Concluir partida
        </Button>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-w-28 flex-1" onClick={() => setRunning((r) => !r)}>
              {running ? 'Pausar' : atHalftime ? 'Começar o 2º tempo' : snap.minute === 0 ? 'Apitar' : 'Continuar'}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={skip}>
              {beforeHalftime ? 'Ir ao intervalo' : 'Ir ao fim'}
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className="mr-1 text-xs text-slate-400">Velocidade</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${speed === s ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
              >
                {s}x
              </button>
            ))}
          </div>
          {atHalftime && <p className="mt-2 text-xs text-emerald-300">Intervalo: faça substituições e mude a tática nas abas abaixo.</p>}
        </Card>
      )}

      <Tabs
        value={tab}
        options={[
          { id: 'log', label: 'Lances' },
          { id: 'stats', label: 'Dados' },
          { id: 'tactics', label: 'Tática' },
          { id: 'subs', label: 'Trocas' },
        ]}
        onChange={setTab}
      />

      {tab === 'log' && <LogList game={game} lines={lines} showFouls={showFouls} onToggleFouls={() => setShowFouls((v) => !v)} />}
      {tab === 'stats' && <StatsList game={game} snap={snap} />}
      {tab === 'tactics' && <TacticPanel live={live} side={mySide} snap={snap} canEdit={canEdit} refresh={refresh} />}
      {tab === 'subs' && <SubsPanel game={game} live={live} side={mySide} canEdit={canEdit} refresh={refresh} />}
    </div>
  )
}

function PreMatch({ game, onNavigate, onStart }: { game: Game; onNavigate: (s: ScreenId) => void; onStart: (instant: boolean) => void }) {
  const match = game.pendingUserMatch
  if (!match) return null
  const team = userTeam(game)
  const home = teamById(game, match.homeTeamId)
  const away = teamById(game, match.awayTeamId)
  const players = new Map(game.season.players.map((p) => [p.id, p]))
  const hurt = team.tactic.startingXI.map((id) => players.get(id)).filter((p): p is Player => !!p && (p.condition.injuryDaysLeft > 0 || p.condition.suspensionGames > 0))
  return (
    <div className="space-y-3">
      <Card title={`Rodada ${match.round} · ${formatDate(match.date)}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            <TeamBadge team={home} size="lg" />
            <span className="w-full truncate text-sm font-semibold">{home.name}</span>
          </div>
          <span className="text-xl font-bold text-slate-400">x</span>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
            <TeamBadge team={away} size="lg" />
            <span className="w-full truncate text-sm font-semibold">{away.name}</span>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">{home.stadium.name}</p>
      </Card>

      <Card title="Seu time">
        <p className="text-sm">
          {team.tactic.formationId} · {PLAY_STYLE_LABELS[team.tactic.style]} · {MENTALITY_LABELS[team.tactic.mentality]}
        </p>
        {hurt.length > 0 && <p className="mt-2 text-sm text-rose-300">{hurt.map(playerName).join(', ')}: indisponível, será trocado pelo melhor reserva.</p>}
        <p className="mt-2 text-xs text-slate-400">A IA não mexe no seu time durante o jogo: substituições e mudanças táticas são com você (principalmente no intervalo).</p>
      </Card>

      <Button variant="secondary" className="w-full" onClick={() => onNavigate('tactics')}>
        Ajustar tática e escalação
      </Button>
      <Button className="w-full text-lg" onClick={() => onStart(false)}>
        Começar a partida
      </Button>
      <Button variant="secondary" className="w-full" onClick={() => onStart(true)}>
        Só ver o resultado
      </Button>
    </div>
  )
}

/** Tela de partida: narração ao vivo, velocidade, placar, dados, intervalo com trocas e mudanças táticas. */
export function MatchScreen({ game, onNavigate }: { game: Game; onNavigate: (s: ScreenId) => void }) {
  const pending = game.pendingUserMatch
  const [started, setStarted] = useState(false)
  const [, rerender] = useState(0)
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
  const live = getLive(pending.id)
  if (live) return <LiveView key={pending.id} game={game} live={live} autoStart={started} onNavigate={onNavigate} />
  return (
    <PreMatch
      game={game}
      onNavigate={onNavigate}
      onStart={(instant) => {
        const session = beginLive(game)
        if (instant) {
          session.match.playUntil(90)
          session.halftimeDone = true
        } else setStarted(true)
        rerender((n) => n + 1)
      }}
    />
  )
}
