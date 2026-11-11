import { useCallback, useEffect, useState } from 'react'
import type { LeagueView, ViewSeat } from '../../../../engine/league/view'
import type { LeagueFixture } from '../../../../engine/league/cupsView'
import type { LeagueDetail, LeagueStateBody } from '../../../../online/leagueApi'
import type { Answer } from '../../../../online/leagueClient'
import { leagueApi, type LeagueTeam } from '../../../../store/leagues'
import { Button, Card } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS, LEAGUE_LOG_LABELS, PACE_LABELS, SEAT_STATUS_LABELS } from '../../../labels'
import { formatMoney } from '../../../format'
import { Pill } from './parts'

const POLL_MS = 5000

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
export function LeagueRunning({ league, teams, onRefresh }: { league: LeagueDetail; teams?: { byId: Map<string, LeagueTeam> }; onRefresh: () => void }) {
  const id = league.id
  const [body, setBody] = useState<LeagueStateBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <>
      <Status view={view} clubOf={clubOf} />

      {me && (
        <Card title="Pronto">
          {view.current ? (
            <>
              <p className="text-sm text-muted">{view.directResult || view.current.playing.includes(me.playerId) ? '' : 'Seu clube não joga nesta rodada. '}A rodada está acontecendo ({view.current.all - view.current.pending} de {view.current.all} partidas dos técnicos terminaram).</p>
              {!view.directResult && view.current.locked.includes(me.playerId) && (
                <p className="mt-2 text-sm font-semibold text-amber" data-testid="locked-hint">
                  A partida começou sem o seu Pronto: a IA joga pelo seu time e você não entra no meio do jogo.
                </p>
              )}
              {!view.directResult && view.current.playing.includes(me.playerId) && !view.current.locked.includes(me.playerId) && (
                <p className="mt-2 text-sm font-semibold" data-testid="live-enter-hint">
                  Seu clube joga agora: abra o jogo do clube e toque em Entrar na partida.
                </p>
              )}
            </>
          ) : view.paused ? (
            <p className="text-sm text-muted">A liga está pausada. O Pronto volta a valer quando o ADM retomar.</p>
          ) : myTurn ? (
            <>
              <p className="text-sm text-muted">Seu clube joga na próxima rodada. A partida só começa quando todos os técnicos que jogam derem Pronto{view.next?.waiting?.deadlineAt ? ` (ou sozinha às ${hourLabel(view.next.waiting.deadlineAt)}, com a IA no lugar de quem faltar)` : ''}.</p>
              <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(() => leagueApi.ready(id, !me.ready))} data-testid="ready-button">
                {me.ready ? 'Pronto! Toque para desfazer' : 'Estou pronto'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted" data-testid="not-playing">Seu clube não joga na próxima rodada. Não precisa dar Pronto.</p>
          )}
        </Card>
      )}

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

    </>
  )
}

/** Quantos dos técnicos que jogam no próximo evento já deram Pronto (ausentes e em piloto automático não contam). */
export function readyCount(view: LeagueView): { done: number; total: number } {
  const required = new Set(view.next?.required ?? [])
  const seats = view.seats.filter((s) => required.has(s.playerId) && s.status === 'active')
  return { done: seats.filter((s) => s.ready).length, total: seats.length }
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
      <div className="rounded-2xl border border-amber/55 bg-amber/10 p-4" data-testid="status-paused">
        <p className="font-bold text-amber">Liga pausada</p>
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
  if (view.next?.waiting) {
    const { done, total } = readyCount(view)
    return (
      <div className="rounded-2xl border border-accent/60 bg-accent/10 p-4" data-testid="status-waiting">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Próxima rodada</p>
        <p className="mt-1 text-xl font-bold text-accent">Jogo pronto · Agora</p>
        <p className="mt-1 text-sm" data-testid="ready-counter">
          Pronto {done}/{total}
        </p>
        <p className="mt-1 text-xs text-muted">
          A partida começa para todos ao mesmo tempo, no minuto 0, quando todos derem Pronto{view.next.waiting.deadlineAt ? `. Se faltar alguém, começa sozinha às ${hourLabel(view.next.waiting.deadlineAt)}, com a IA jogando por quem não deu Pronto` : ''}.
        </p>
        <Fixtures fixtures={view.next.fixtures} clubOf={clubOf} />
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
        <p className="mt-2 text-xs text-muted">{open ? 'A sala está aberta: quando todos derem Pronto, a partida começa.' : `A sala abre às ${hourLabel(view.next.roomOpensAt)}.`}</p>
      </div>
    )
  }
  return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">Sem rodadas marcadas agora. {PACE_LABELS[view.pace]}.</p>
}
