import { useCallback, useEffect, useState } from 'react'
import type { PaceId } from '../../../../engine/league/pace'
import type { LeagueView, ViewSeat } from '../../../../engine/league/view'
import type { LeagueFixture } from '../../../../engine/league/cupsView'
import type { ControlAction, LeagueDetail, LeagueStateBody } from '../../../../online/leagueApi'
import type { Answer } from '../../../../online/leagueClient'
import { leagueApi, type LeagueTeam } from '../../../../store/leagues'
import { Button, Card } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS, LEAGUE_LOG_LABELS, PACE_LABELS, SEAT_STATUS_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'
import { ClubCard } from './ClubCard'
import { CupsCard } from './CupsCard'
import { LeagueMarket } from './LeagueMarket'
import { formatMoney } from '../../../format'
import { Pill } from './parts'

const POLL_MS = 5000
const PACE_ORDER: PaceId[] = ['calm', 'normal', 'fast', 'very-fast']

/** Dia da semana, data e hora no fuso do aparelho (o servidor só guarda milissegundos). */
export const whenLabel = (ms: number): string => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
export const hourLabel = (ms: number): string => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/** "daqui a 3 h 20 min" / "em 12 min" / "agora". */
export function inLabel(ms: number): string {
  if (ms <= 60_000) return 'agora'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `em ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `em ${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  return `em ${Math.round(h / 24)} dias`
}

/**
 * Liga em andamento (B8.4): calendário no fuso do aparelho, "Pronto" de quem tem partida no próximo evento e, para o ADM, Avançar (com
 * confirmação), Pausar/Retomar, ritmo e sugestões de ausência. Consulta a sala a cada poucos segundos.
 */
export function LeagueRunning({ league, teams, onRefresh, inGame = false }: { league: LeagueDetail; teams?: { byId: Map<string, LeagueTeam> }; onRefresh: () => void; inGame?: boolean }) {
  const id = league.id
  const [body, setBody] = useState<LeagueStateBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAdvance, setConfirmAdvance] = useState(false)
  const [pacing, setPacing] = useState(false)
  const [market, setMarket] = useState(false)

  const load = useCallback(async () => {
    const r = await leagueApi.state(id)
    if (r.ok) setBody(r)
    else setError(LEAGUE_ERROR_LABELS[r.error])
  }, [id])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const nick = (playerId: string): string => league.members.find((m) => m.playerId === playerId)?.nickname ?? 'Técnico'
  const clubOf = (teamId: string): string => teams?.byId.get(teamId)?.team.name ?? teamId
  const run = async (call: () => Promise<Answer<unknown>>) => {
    setBusy(true)
    setError(null)
    const r = await call()
    if (!r.ok) setError(LEAGUE_ERROR_LABELS[r.error])
    await load()
    setBusy(false)
    onRefresh()
  }

  if (!body?.view) return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">{error ?? 'Carregando o andamento da liga…'}</p>
  const view = body.view
  const me = view.seats.find((s) => s.teamId === league.myTeamId)
  const myTurn = me?.required === true
  const control = (action: ControlAction) => run(() => leagueApi.control(id, action))

  return (
    <>
      {market && <LeagueMarket league={league} teams={teams} worldDate={view.worldDate} onClose={() => setMarket(false)} />}
      <Status view={view} clubOf={clubOf} />

      {me && (
        <Card title="Pronto">
          {view.current ? (
            <>
              <p className="text-sm text-muted">{view.directResult || view.current.playing.includes(me.playerId) ? '' : 'Seu clube não joga nesta rodada. '}A rodada está acontecendo ({view.current.all - view.current.pending} de {view.current.all} partidas dos técnicos terminaram).</p>
              {!view.directResult && view.current.playing.includes(me.playerId) && (
                <p className="mt-2 text-sm font-semibold" data-testid="live-enter-hint">
                  Seu clube joga agora: abra o jogo do clube e toque em Entrar na partida.
                </p>
              )}
            </>
          ) : view.paused ? (
            <p className="text-sm text-muted">A liga está pausada. O Pronto volta a valer quando o ADM retomar.</p>
          ) : myTurn ? (
            <>
              <p className="text-sm text-muted">Seu clube joga na próxima rodada. Quando todos os técnicos dão Pronto, com a sala aberta, a rodada começa antes do horário.</p>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(() => leagueApi.ready(id, !me.ready))} data-testid="ready-button">
                {me.ready ? 'Pronto! Toque para desfazer' : 'Estou pronto'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted" data-testid="not-playing">Seu clube não joga na próxima rodada. Não precisa dar Pronto.</p>
          )}
        </Card>
      )}

      {me && !inGame && (
        <Card title="Mercado">
          <p className="text-sm text-muted">Proponha compras e empréstimos aos outros técnicos, contrate jogadores livres e acompanhe as transferências da liga.</p>
          <Button className="mt-3 w-full" onClick={() => setMarket(true)} data-testid="open-market">
            {body.awaiting ? `Abrir o mercado (${body.awaiting} proposta${body.awaiting > 1 ? 's' : ''} esperando você)` : 'Abrir o mercado'}
          </Button>
        </Card>
      )}
      {/* Dentro do jogo (Fase 6C) o clube, as copas e o resto são as telas do jogo solo; estes cartões simples só existem fora dele. */}
      {me && !inGame && <ClubCard leagueId={id} />}
      {me && !inGame && <CupsCard leagueId={id} clubOf={clubOf} />}

      <Card title="Quem está pronto">
        <ul className="flex flex-col gap-2" data-testid="ready-list">
          {view.seats.map((s) => (
            <li key={s.playerId} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{nick(s.playerId)}</span>
                <span className="block truncate text-xs text-muted">{clubOf(s.teamId)}</span>
              </span>
              <SeatPill seat={s} />
            </li>
          ))}
          {view.seats.length === 0 && <li className="text-sm text-muted">Nenhum técnico com clube ainda.</li>}
        </ul>
      </Card>

      <Card title="Calendário">
        <p className="mb-2 text-xs text-muted">Horários no fuso do seu aparelho. Data do mundo agora: {dateLabel(view.worldDate)}.</p>
        {view.events.length === 0 ? (
          <p className="text-sm text-muted">Sem rodadas marcadas para as próximas semanas.</p>
        ) : (
          <ol className="flex flex-col gap-1.5" data-testid="calendar">
            {view.events.map((e, i) => (
              <li key={e.startAt} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{whenLabel(e.startAt)}</span>
                  <span className="text-xs text-muted">{view.paused && i === 0 ? 'horário refeito ao retomar' : `jogos de ${dateLabel(e.date)}`}</span>
                </span>
                {competitionsOf(e.fixtures).length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1" data-testid="calendar-competitions">
                    {competitionsOf(e.fixtures).map((c) => (
                      <Pill key={c.name} tone={c.cup ? 'accent' : 'muted'}>{c.name}</Pill>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {body.isAdmin && (
        <Card title="Controles do ADM">
          <div className="flex flex-col gap-2">
            {view.paused ? (
              <Button disabled={busy} onClick={() => void control('resume')} data-testid="resume-league">
                Retomar a liga
              </Button>
            ) : (
              <>
                <Button disabled={busy || !!view.current || !view.next} onClick={() => setConfirmAdvance(true)} data-testid="advance-league">
                  Avançar para a próxima rodada
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void control('pause')} data-testid="pause-league">
                  Pausar a liga
                </Button>
              </>
            )}
            {league.kind === 'friends' && (
              <Button variant="secondary" disabled={busy || !!view.current} onClick={() => setPacing(true)} data-testid="change-pace">
                Ritmo: {PACE_LABELS[view.pace]}
              </Button>
            )}
          </div>
          {view.suggestions.length > 0 && (
            <div className="mt-4 rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-3" data-testid="absence-suggestions">
              <p className="text-sm font-bold text-yellow-300">Técnicos sumidos</p>
              <p className="mt-1 text-xs text-muted">Estes técnicos perderam várias rodadas seguidas. A IA joga por eles. Se quiser abrir a vaga, remova o técnico: o clube volta para a IA.</p>
              <ul className="mt-2 flex flex-col gap-2">
                {view.suggestions.map((s) => (
                  <li key={s.playerId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <b>{nick(s.playerId)}</b> · {clubOf(s.teamId)} · {s.missed} rodadas perdidas, {s.idleDays} dias sem aparecer
                    </span>
                    <button type="button" className="min-h-12 flex-none rounded-lg px-2 text-xs text-loss hover:bg-surface" disabled={busy} onClick={() => void run(() => leagueApi.admin(id, 'kick', s.playerId))}>
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {view.transfers.length > 0 && (
        <Card title="Últimas transferências">
          <ul className="flex flex-col gap-2 text-sm" data-testid="room-transfers">
            {view.transfers.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span className="font-semibold">{r.playerName}</span>
                <span className="block text-xs text-muted">
                  {r.kind === 'free' ? 'Contratado livre' : r.kind === 'loan' ? 'Emprestado' : 'Vendido'} · {r.fromTeamId ? clubOf(r.fromTeamId) : 'Livre'} → {clubOf(r.toTeamId)} · {r.fee > 0 ? formatMoney(r.fee) : 'sem taxa'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {view.log.length > 0 && (
      <Card title="Últimos acontecimentos">
          <ul className="flex flex-col gap-1 text-xs text-muted" data-testid="league-log">
            {[...view.log].reverse().slice(0, 8).map((l, i) => (
              <li key={i}>
                {whenLabel(l.at)} · {LEAGUE_LOG_LABELS[l.type]}
                {l.by ? ` (${nick(l.by) === 'Técnico' ? 'ADM' : nick(l.by)})` : ''}
                {l.date ? ` · jogos de ${dateLabel(l.date)}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="running-error">
          {error}
        </p>
      )}

      {confirmAdvance && (
        <Sheet
          title="Avançar para a próxima rodada?"
          onClose={() => setConfirmAdvance(false)}
          footer={
            <div className="flex flex-col gap-3">
              <Button
                disabled={busy}
                onClick={() => {
                  setConfirmAdvance(false)
                  void control('advance')
                }}
                data-testid="confirm-advance"
              >
                Avançar agora
              </Button>
              <Button variant="secondary" onClick={() => setConfirmAdvance(false)}>
                Esperar
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted">
            A rodada de {view.next ? dateLabel(view.next.date) : '—'} começa agora, sem esperar o horário ({view.next ? whenLabel(view.next.startAt) : ''}). Os horários das rodadas seguintes não mudam.
          </p>
          {view.next && view.next.notReady.length > 0 ? (
            <div className="mt-3 rounded-xl border border-yellow-500/50 bg-yellow-500/10 p-3" data-testid="advance-not-ready">
              <p className="text-sm font-bold text-yellow-300">Ainda não deram Pronto:</p>
              <p className="mt-1 text-sm">{view.next.notReady.map(nick).join(', ')}</p>
              <p className="mt-1 text-xs text-muted">Quem não estiver presente joga com a IA no lugar.</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-win">Todos os técnicos com partida já deram Pronto.</p>
          )}
        </Sheet>
      )}

      {pacing && (
        <Sheet title="Ritmo da liga" onClose={() => setPacing(false)}>
          <p className="mb-3 text-sm text-muted">Muda a velocidade das próximas rodadas. O que já aconteceu não muda e os horários futuros são refeitos agora.</p>
          <div className="flex flex-col gap-2">
            {PACE_ORDER.map((p) => (
              <Button
                key={p}
                variant={p === view.pace ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => {
                  setPacing(false)
                  if (p !== view.pace) void run(() => leagueApi.pace(id, p))
                }}
                data-testid={`pace-${p}`}
              >
                {PACE_LABELS[p]}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

function SeatPill({ seat }: { seat: ViewSeat }) {
  if (seat.leaving) return <Pill tone="warn">Saindo</Pill>
  if (seat.status !== 'active') return <Pill tone="warn">{SEAT_STATUS_LABELS[seat.status]}</Pill>
  if (!seat.required) return <Pill>Sem jogo</Pill>
  return seat.ready ? <Pill tone="win">Pronto</Pill> : <Pill tone="warn">Falta</Pill>
}

/** As competições (liga e copas) que um evento tem, sem repetir. */
const competitionsOf = (fixtures: LeagueFixture[] | undefined): { name: string; cup: boolean }[] => {
  const seen = new Map<string, boolean>()
  for (const f of fixtures ?? []) seen.set(f.competition, f.cup)
  return [...seen].map(([name, cup]) => ({ name, cup }))
}

/** Os jogos dos técnicos nesta data: liga ou copa (com a fase) e os dois clubes. */
function Fixtures({ fixtures, clubOf }: { fixtures: LeagueFixture[] | undefined; clubOf: (teamId: string) => string }) {
  if (!fixtures || fixtures.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-1.5" data-testid="fixtures">
      {fixtures.map((f) => (
        <li key={`${f.homeTeamId}-${f.awayTeamId}`} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {f.competition}
            {f.detail ? ` · ${f.detail}` : ''}
          </span>
          <span className="block font-semibold">
            {clubOf(f.homeTeamId)} x {clubOf(f.awayTeamId)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Status({ view, clubOf }: { view: LeagueView; clubOf: (teamId: string) => string }) {
  if (view.paused) {
    return (
      <div className="rounded-2xl border border-yellow-500/50 bg-yellow-500/10 p-4" data-testid="status-paused">
        <p className="font-bold text-yellow-300">Liga pausada</p>
        <p className="mt-1 text-sm text-muted">O tempo está parado. Quando o ADM retomar, os horários das próximas rodadas são refeitos. Se ninguém retomar, a liga volta sozinha em {view.autoResumeAt ? whenLabel(view.autoResumeAt) : '30 dias'}.</p>
      </div>
    )
  }
  if (view.current) {
    return (
      <div className="rounded-2xl border border-win/50 bg-win/10 p-4" data-testid="status-event">
        <p className="font-bold text-win">Rodada em andamento</p>
        <p className="mt-1 text-sm text-muted">Jogos de {dateLabel(view.current.date)}. Faltam {view.current.pending} de {view.current.all} partidas dos técnicos.</p>
        <Fixtures fixtures={view.current.fixtures} clubOf={clubOf} />
      </div>
    )
  }
  if (view.next) {
    const open = view.now >= view.next.roomOpensAt
    return (
      <div className="rounded-2xl border border-line bg-surface p-4" data-testid="status-next">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Próxima rodada</p>
        <p className="mt-1 text-xl font-bold">{whenLabel(view.next.startAt)}</p>
        <p className="mt-1 text-sm text-muted">
          Jogos de {dateLabel(view.next.date)} · {inLabel(view.next.startAt - view.now)}
        </p>
        <Fixtures fixtures={view.next.fixtures} clubOf={clubOf} />
        <p className="mt-2 text-xs text-muted">{open ? 'A sala está aberta: quando todos derem Pronto, a rodada começa.' : `A sala abre às ${hourLabel(view.next.roomOpensAt)}.`}</p>
      </div>
    )
  }
  return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">Sem rodadas marcadas agora. {PACE_LABELS[view.pace]}.</p>
}
