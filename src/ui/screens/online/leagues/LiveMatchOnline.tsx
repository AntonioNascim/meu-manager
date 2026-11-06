import { useEffect, useMemo, useRef, useState } from 'react'
import { FORMATION_IDS } from '../../../../engine/formations'
import type { RejectReason } from '../../../../engine/league/live'
import type { Mentality, PlayStyle } from '../../../../engine/types'
import type { RosterPlayer } from '../../../../online/liveProtocol'
import { myGame, mySide, type LiveClientState, type LiveSession } from '../../../../online/liveSession'
import { openLiveSession } from '../../../../store/leagues'
import { Button, Card, Segmented, TeamBadge } from '../../../components/ui'
import { LIVE_REJECT_LABELS, MENTALITY_LABELS, PLAY_STYLE_LABELS } from '../../../labels'
import { buildLog } from '../../Match'
import { Pitch, type PitchData } from '../../match/Pitch'
import { Pill } from './parts'

const STYLES: PlayStyle[] = ['possession', 'counter-attack', 'high-press']
const MENTALITIES: Mentality[] = [-2, -1, 0, 1, 2]
const MENTALITY_SHORT: Record<Mentality, string> = { [-2]: 'Muito defensiva', [-1]: 'Defensiva', 0: 'Equilibrada', 1: 'Ofensiva', 2: 'Muito ofensiva' }

const playerLabel = (p: Pick<RosterPlayer, 'name'> & { nickname?: string }): string => p.nickname ?? p.name

/**
 * Partida ao vivo de uma liga online (B8.5): o servidor joga (mesmo motor, um minuto a cada ~10 s no ritmo Normal) e esta tela só mostra o que ele manda
 * pelo WebSocket e envia as decisões do técnico (tática, formação, trocas), que entram no minuto seguinte. Se a conexão cai o clube joga com a IA do
 * servidor e a tela reconecta sozinha; ao voltar, retoma o time.
 */
export function LiveMatchOnline({ leagueId, onClose }: { leagueId: string; onClose: () => void }) {
  const session = useRef<LiveSession | null>(null)
  const [state, setState] = useState<LiveClientState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const s = openLiveSession(leagueId)
    session.current = s
    const off = s.subscribe(setState)
    void s.connect()
    return () => {
      off()
      s.close()
    }
  }, [leagueId, attempt])
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [])

  const roster = state?.roster
  const data: PitchData | null = useMemo(() => (roster ? { teams: roster.teams, players: roster.players } : null), [roster])
  if (!state) return null
  const game = myGame(state)
  const side = mySide(state)
  const teamOf = (id: string) => roster?.teams.find((t) => t.id === id)
  const warning = state.resumeAt !== undefined && state.resumeAt > now ? Math.ceil((state.resumeAt - now) / 1000) : 0

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg" data-testid="live-online">
      <div className="mx-auto max-w-md space-y-3 px-3 pb-10">
        <div className="sticky top-0 z-10 -mx-3 space-y-2 bg-bg/95 px-3 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button variant="secondary" onClick={() => (state.status === 'live' && game && !game.snapshot.finished ? setLeaving(true) : onClose())} data-testid="live-back">
            Voltar
          </Button>
          <StatusPill state={state} />
        </div>

        {leaving && (
          <div className="rounded-2xl border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm" data-testid="live-leave-confirm">
            <p className="font-semibold text-yellow-300">Sair da partida?</p>
            <p className="mt-1 text-muted">Seu time passa a ser jogado pela IA do servidor até você voltar. Você pode entrar de novo a qualquer momento enquanto a rodada durar.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={() => setLeaving(false)}>Ficar</Button>
              <Button onClick={onClose} data-testid="live-leave">Sair</Button>
            </div>
          </div>
        )}

        {state.paused && (
          <div className="rounded-2xl border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm" data-testid="live-paused">
            <p className="font-bold text-yellow-300">Partida pausada pelo ADM</p>
            <p className="text-muted">O relógio está parado. Quando o ADM retomar, você terá 10 segundos de aviso antes do próximo lance.</p>
          </div>
        )}
        {!state.paused && warning > 0 && (
          <div className="rounded-2xl border border-win/50 bg-win/10 p-3 text-sm" data-testid="live-resume-warning">
            <p className="font-bold text-win">O jogo volta em {warning} s</p>
            <p className="text-muted">Confira a tática e as trocas antes do próximo lance.</p>
          </div>
        )}
        </div>

        {state.status === 'failed' && (
          <div className="rounded-2xl border border-loss/50 bg-loss/10 p-3 text-sm" data-testid="live-failed">
            <p className="font-bold text-loss">Sem conexão com a partida</p>
            <p className="text-muted">Seu time está sendo jogado pela IA. Confira a internet e tente de novo.</p>
            <Button className="mt-2" onClick={() => setAttempt((n) => n + 1)} data-testid="live-retry">Tentar de novo</Button>
          </div>
        )}
        {state.status === 'no-event' && (
          <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted" data-testid="live-no-event">Nenhuma partida acontecendo agora. A sala volta ao andamento da liga.</p>
        )}
        {state.status === 'live' && !game && (
          <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted" data-testid="live-not-playing">Seu clube não joga nesta rodada. Volte para a sala.</p>
        )}
        {state.status === 'connecting' && !roster && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">Conectando à partida…</p>}

        {game && data && roster && (
          <>
            <Scoreboard state={state} />
            <Pitch data={data} snap={game.snapshot} speed={1} running={state.status === 'live' && !state.paused} />
            {side && !game.snapshot.finished && state.status !== 'no-event' && <Controls state={state} side={side} session={session.current} />}
            {state.games.length > 1 && (
              <Card title="Outros jogos desta rodada" className="!p-3">
                <ul className="space-y-1.5" data-testid="live-others">
                  {state.games
                    .filter((g) => g.matchId !== game.matchId)
                    .map((g) => {
                      const h = teamOf(g.snapshot.home.teamId)
                      const a = teamOf(g.snapshot.away.teamId)
                      return (
                        <li key={g.matchId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-right">{h?.shortName ?? h?.name}</span>
                          <span className="rounded bg-bg px-2 py-0.5 font-bold tabular-nums">{g.snapshot.homeGoals} x {g.snapshot.awayGoals}</span>
                          <span className="min-w-0 flex-1 truncate">{a?.shortName ?? a?.name}</span>
                        </li>
                      )
                    })}
                </ul>
              </Card>
            )}
            <Card title="Lances" className="!p-3">
              <ul className="space-y-1.5" data-testid="live-log">
                {buildLog(game.snapshot, game.snapshot.minute > 45, false)
                  .slice(0, 30)
                  .map((l) => (
                    <li key={l.key} className={`flex gap-2 text-sm ${l.strong ? 'font-semibold' : 'text-muted'}`}>
                      <span className="w-8 shrink-0 text-right tabular-nums text-muted">{l.minute}'</span>
                      <span aria-hidden="true">{l.icon}</span>
                      <span className="min-w-0">{l.text}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function StatusPill({ state }: { state: LiveClientState }) {
  if (state.status === 'ended') return <Pill tone="muted">Rodada encerrada</Pill>
  if (state.status === 'failed') return <Pill tone="warn">Sem conexão</Pill>
  if (state.status === 'reconnecting') return <Pill tone="warn">Reconectando…</Pill>
  if (state.status === 'connecting') return <Pill tone="muted">Conectando…</Pill>
  if (state.paused) return <Pill tone="warn">Pausada</Pill>
  return <Pill tone="win">Ao vivo</Pill>
}

function Scoreboard({ state }: { state: LiveClientState }) {
  const game = myGame(state)
  const roster = state.roster
  if (!game || !roster) return null
  const home = roster.teams.find((t) => t.id === game.snapshot.home.teamId)
  const away = roster.teams.find((t) => t.id === game.snapshot.away.teamId)
  if (!home || !away) return null
  const s = game.snapshot
  return (
    <div className="rounded-2xl border border-line bg-surface p-3" data-testid="live-score">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <TeamBadge team={home} />
          <span className="max-w-full truncate text-xs font-semibold">{home.shortName ?? home.name}</span>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums" data-testid="live-result">{s.homeGoals} x {s.awayGoals}</p>
          <p className="text-xs text-muted" data-testid="live-minute">{s.finished ? 'Fim de jogo' : `${s.minute}'`}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <TeamBadge team={away} />
          <span className="max-w-full truncate text-xs font-semibold">{away.shortName ?? away.name}</span>
        </div>
      </div>
    </div>
  )
}

function Controls({ state, side, session }: { state: LiveClientState; side: 'home' | 'away'; session: LiveSession | null }) {
  const game = myGame(state)
  const roster = state.roster
  const [out, setOut] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const mine = game?.snapshot[side]
  const byId = useMemo(() => new Map((roster?.players ?? []).map((p) => [p.id, p])), [roster])
  const lastOutcome = state.outcomes.at(-1)
  useEffect(() => {
    if (!lastOutcome) return
    setNote(lastOutcome.ok ? 'Pronto, valeu a partir deste minuto.' : (LIVE_REJECT_LABELS[lastOutcome.reason as RejectReason] ?? 'O comando não foi aceito.'))
  }, [lastOutcome])
  if (!game || !mine) return null
  const waiting = state.pending.length > 0
  const send = (command: Parameters<LiveSession['send']>[0]): void => {
    const id = session?.send(command)
    setNote(id ? 'Enviado: vale no próximo minuto de jogo.' : 'Sem conexão para enviar agora.')
  }
  return (
    <Card title="Seu time" className="!p-3">
      <div className="space-y-3" data-testid="live-controls">
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Estilo de jogo</p>
          <Segmented value={mine.style} options={STYLES.map((id) => ({ id, label: PLAY_STYLE_LABELS[id] }))} onChange={(style) => send({ type: 'style', style })} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Mentalidade</p>
          <div className="grid grid-cols-5 gap-1">
            {MENTALITIES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => send({ type: 'mentality', mentality: m })}
                className={`min-h-11 rounded-lg px-0.5 text-[10px] font-semibold leading-tight ${mine.mentality === m ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                title={MENTALITY_LABELS[m]}
              >
                {MENTALITY_SHORT[m]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="live-formation">Formação</label>
          <select
            id="live-formation"
            value={mine.formationId}
            onChange={(e) => send({ type: 'formation', formationId: e.target.value })}
            className="min-h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm"
            data-testid="live-formation"
          >
            {mine.formationId === 'custom' && <option value="custom">Livre</option>}
            {FORMATION_IDS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">
            Trocas: {mine.subsLeft} restantes · {mine.stopsLeft} paradas
          </p>
          <p className="mb-1 text-[11px] text-muted">Toque em quem sai e depois em quem entra.</p>
          <ul className="grid grid-cols-2 gap-1" data-testid="live-onpitch">
            {mine.onPitch.map((p) => {
              const info = byId.get(p.playerId)
              return (
                <li key={p.playerId}>
                  <button
                    type="button"
                    onClick={() => setOut(out === p.playerId ? null : p.playerId)}
                    className={`min-h-11 w-full rounded-lg px-2 text-left text-xs ${out === p.playerId ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}
                  >
                    <span className="block truncate font-semibold">{info ? playerLabel(info) : p.playerId}</span>
                    <span className="opacity-80">{p.slot} · {Math.round(p.fitness)}%{p.yellowCards ? ' · 🟨' : ''}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {out && (
            <div className="mt-2" data-testid="live-bench">
              <p className="mb-1 text-xs font-semibold">Quem entra?</p>
              <ul className="grid grid-cols-2 gap-1">
                {mine.bench.map((id) => {
                  const info = byId.get(id)
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="min-h-11 w-full rounded-lg bg-slate-700 px-2 text-left text-xs text-slate-200"
                        onClick={() => {
                          send({ type: 'substitute', outgoingId: out, incomingId: id })
                          setOut(null)
                        }}
                      >
                        <span className="block truncate font-semibold">{info ? playerLabel(info) : id}</span>
                        <span className="opacity-80">{info?.position} · força {info?.overall}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
        {(note || waiting) && <p className="text-xs text-muted" data-testid="live-note">{waiting ? 'Enviado: vale no próximo minuto de jogo.' : note}</p>}
      </div>
    </Card>
  )
}

