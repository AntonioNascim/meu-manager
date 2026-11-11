import { useCallback, useEffect, useState } from 'react'
import type { PaceId } from '../../../../engine/league/pace'
import type { AdminAction, ControlAction, LeagueDetail, LeagueStateBody, VacancyRow } from '../../../../online/leagueApi'
import type { Answer } from '../../../../online/leagueClient'
import { leagueApi, useLeagueTeams } from '../../../../store/leagues'
import { Button, Card } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS, PACE_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'
import { ClubPicker } from './ClubPicker'
import { inLabel, whenLabel } from './LeagueRunning'
import { Pill } from './parts'

const POLL_MS = 5000
const PACE_ORDER: PaceId[] = ['calm', 'normal', 'fast', 'very-fast']
const pretty = (code: string): string => (code.length > 8 ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}` : `${code.slice(0, 4)}-${code.slice(4)}`)
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/** "há 3 h" / "há 2 dias" / "agora há pouco". */
export function sinceLabel(ms: number): string {
  if (ms < 5 * 60_000) return 'agora há pouco'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.round(h / 24)} dias`
}

type Confirm = { kind: 'advance' } | { kind: 'kick'; playerId: string } | { kind: 'make-admin'; playerId: string } | { kind: 'cancel-vacancy'; code: string }

/**
 * Painel do ADM (Fase 6C+): tudo o que só o ADM faz, num lugar só, aberto pelo botão "ADM" do jogo do clube: informações da liga, Avançar e Pausar,
 * código de vaga (reserva um clube por 72 horas), entrada de técnicos novos e a lista de técnicos (remover e passar o cargo).
 */
export function AdminPanel({ leagueId }: { leagueId: string }) {
  const [league, setLeague] = useState<LeagueDetail | null>(null)
  const [body, setBody] = useState<LeagueStateBody | null>(null)
  const [vacancies, setVacancies] = useState<VacancyRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [picking, setPicking] = useState(false)
  const [pacing, setPacing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const { data: teams } = useLeagueTeams(league ?? undefined)

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([leagueApi.get(leagueId), leagueApi.state(leagueId)])
    if (l.ok) setLeague(l.league)
    else setError(LEAGUE_ERROR_LABELS[l.error])
    if (s.ok) setBody(s)
    if (l.ok && l.league.isAdmin && l.league.kind === 'friends') {
      const v = await leagueApi.vacancies(leagueId)
      if (v.ok) setVacancies(v.vacancies)
    }
  }, [leagueId])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const run = async (call: () => Promise<Answer<unknown>>) => {
    setBusy(true)
    setError(null)
    const r = await call()
    if (!r.ok) setError(LEAGUE_ERROR_LABELS[r.error])
    await load()
    setBusy(false)
  }
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      setError('Não foi possível copiar. Selecione o texto e copie à mão.')
    }
  }

  if (!league || !body) return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">{error ?? 'Carregando o painel…'}</p>
  if (!league.isAdmin) return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted" data-testid="admin-forbidden">Só o ADM da liga vê este painel.</p>

  const view = body.view
  const clubOf = (teamId: string): string => teams?.byId.get(teamId)?.team.name ?? teamId
  const control = (action: ControlAction) => run(() => leagueApi.control(leagueId, action))
  const act = (action: AdminAction, playerId?: string) => run(() => leagueApi.admin(leagueId, action, playerId))
  const nick = (playerId: string): string => league.members.find((m) => m.playerId === playerId)?.nickname ?? 'Técnico'
  const seatOf = (playerId: string) => view?.seats.find((s) => s.playerId === playerId)
  const friends = league.kind === 'friends'
  const waiting = view?.next?.waiting !== undefined

  if (picking) {
    return (
      <ClubPicker
        league={{ ...league, members: league.members }}
        busy={busy}
        error={error}
        onBack={() => setPicking(false)}
        onPick={(teamId) => {
          setPicking(false)
          void run(() => leagueApi.vacancyCreate(leagueId, teamId))
        }}
      />
    )
  }

  return (
    <div className="space-y-3" data-testid="admin-panel">
      <div>
        <div className="title text-2xl">Painel do ADM</div>
        <div className="text-xs text-muted">{league.name}</div>
      </div>

      <Card title="Informações da liga">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm" data-testid="admin-info">
          {friends && league.code && (
            <>
              <dt className="text-muted">Código de convite</dt>
              <dd className="text-right font-bold tracking-widest" data-testid="admin-invite-code">
                {pretty(league.code)}
              </dd>
            </>
          )}
          <dt className="text-muted">Ritmo</dt>
          <dd className="text-right font-semibold">{PACE_LABELS[league.pace]}</dd>
          <dt className="text-muted">Temporada</dt>
          <dd className="text-right font-semibold">{view ? view.season : '—'}</dd>
          <dt className="text-muted">Data do mundo</dt>
          <dd className="text-right font-semibold">{view ? dateLabel(view.worldDate) : '—'}</dd>
          <dt className="text-muted">Seu clube está no</dt>
          <dd className="text-right font-semibold" data-testid="admin-progress">
            {view?.progress ? `jogo ${Math.min(view.progress.played + 1, view.progress.total)}/${view.progress.total}` : '—'}
          </dd>
          <dt className="text-muted">Técnicos</dt>
          <dd className="text-right font-semibold">
            {league.humans} de {league.maxHumans}
          </dd>
        </dl>
        {friends && league.code && (
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void copy('code', league.code as string)}>
              {copied === 'code' ? 'Copiado' : 'Copiar código'}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => void copy('link', `${window.location.origin}${window.location.pathname}?online=1&convite=${league.code}`)}>
              {copied === 'link' ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        )}
        {friends && (
          <Button variant="secondary" className="mt-2 w-full" disabled={busy || !!view?.current || waiting} onClick={() => setPacing(true)} data-testid="change-pace">
            Mudar o ritmo
          </Button>
        )}
      </Card>

      <Card title="Tempo da liga">
        <div className="flex flex-col gap-2">
          {view?.paused ? (
            <Button disabled={busy} onClick={() => void control('resume')} data-testid="resume-league">
              Retomar a liga
            </Button>
          ) : (
            <>
              <Button disabled={busy || !!view?.current || waiting || !view?.next} onClick={() => setConfirm({ kind: 'advance' })} data-testid="advance-league">
                Avançar até o próximo jogo
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void control('pause')} data-testid="pause-league">
                Pausar a liga
              </Button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-muted" data-testid="admin-time-hint">
          {view?.paused
            ? 'O tempo está parado. Os horários são refeitos ao retomar.'
            : view?.current
              ? 'Há uma rodada em andamento.'
              : waiting
                ? 'O jogo está pronto: a partida começa quando todos darem Pronto.'
                : view?.next
                  ? `Próximo jogo: ${whenLabel(view.next.startAt)} (${inLabel(view.next.startAt - view.now)}).`
                  : 'Sem jogos marcados agora.'}
        </p>
      </Card>

      {friends && (
        <Card title="Código de vaga">
          <p className="text-xs text-muted">Reserve um clube sem técnico humano e mande o código a quem vai assumi-lo. Quem entrar com o código cria o técnico direto nesse clube, que fica reservado por 72 horas.</p>
          <Button className="mt-3 w-full" disabled={busy || league.status !== 'running'} onClick={() => setPicking(true)} data-testid="vacancy-new">
            Escolher um clube e gerar o código
          </Button>
          {vacancies.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" data-testid="vacancy-list">
              {vacancies.map((v) => (
                <li key={v.code} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <span className="block truncate font-semibold">{clubOf(v.teamId)}</span>
                  <span className="block text-lg font-bold tracking-widest" data-testid="vacancy-code">
                    {pretty(v.code)}
                  </span>
                  <span className="block text-xs text-muted">Reservado por mais {Math.max(1, Math.round((v.expiresAt - (view?.now ?? Date.now())) / 3_600_000))} h</span>
                  <span className="mt-2 flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => void copy(v.code, v.code)}>
                      {copied === v.code ? 'Copiado' : 'Copiar'}
                    </Button>
                    <button type="button" className="min-h-12 flex-1 rounded-xl border border-line text-sm text-loss" disabled={busy} onClick={() => setConfirm({ kind: 'cancel-vacancy', code: v.code })}>
                      Cancelar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="Entrada de técnicos novos">
        <p className="text-sm text-muted" data-testid="entry-state">
          {league.entryClosed ? 'A entrada está fechada: só entra quem tiver um código de vaga.' : 'A entrada está aberta.'}
        </p>
        <Button variant="secondary" className="mt-3 w-full" disabled={busy} onClick={() => void act(league.entryClosed ? 'open-entry' : 'close-entry')} data-testid="toggle-entry">
          {league.entryClosed ? 'Abrir a entrada' : 'Fechar a entrada'}
        </Button>
      </Card>

      <Card title="Técnicos">
        {view && view.suggestions.length > 0 && (
          <p className="mb-2 rounded-xl border border-amber/55 bg-amber/10 p-2 text-xs text-amber" data-testid="absence-suggestions">
            Sumidos há várias rodadas: {view.suggestions.map((s) => nick(s.playerId)).join(', ')}. A IA joga por eles.
          </p>
        )}
        <ul className="flex flex-col gap-2" data-testid="admin-coaches">
          {league.members.map((m) => {
            const seat = seatOf(m.playerId)
            return (
              <li key={m.playerId} className="rounded-xl bg-surface-2 p-3 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {m.nickname ?? 'Técnico'} {m.isAdmin && <span className="text-xs text-accent">ADM</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{clubOf(m.teamId)}</span>
                  </span>
                  <span className="flex-none text-right text-xs text-muted">
                    <span className="block">Última vez</span>
                    <span className="block font-semibold text-slate-200" data-testid="last-seen">
                      {seat ? sinceLabel((view?.now ?? Date.now()) - seat.lastActiveAt) : '—'}
                    </span>
                  </span>
                </span>
                {seat && seat.status !== 'active' && <Pill tone="warn">{seat.status === 'absent' ? 'Ausente' : 'Piloto automático'}</Pill>}
                {!m.isAdmin && (
                  <span className="mt-2 flex gap-2">
                    <button type="button" className="min-h-12 flex-1 rounded-xl border border-line text-sm" disabled={busy} onClick={() => setConfirm({ kind: 'make-admin', playerId: m.playerId })} data-testid={`make-admin-${m.playerId}`}>
                      Passar o cargo
                    </button>
                    <button type="button" className="min-h-12 flex-1 rounded-xl border border-line text-sm text-loss" disabled={busy} onClick={() => setConfirm({ kind: 'kick', playerId: m.playerId })} data-testid={`kick-${m.playerId}`}>
                      Remover
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-loss" data-testid="admin-error">
          {error}
        </p>
      )}

      {confirm && (
        <Sheet
          title={confirm.kind === 'advance' ? 'Avançar até o próximo jogo?' : confirm.kind === 'kick' ? 'Remover o técnico?' : confirm.kind === 'make-admin' ? 'Passar o cargo de ADM?' : 'Cancelar o código de vaga?'}
          onClose={() => setConfirm(null)}
          footer={
            <div className="flex flex-col gap-3">
              <Button
                disabled={busy}
                data-testid="confirm-action"
                onClick={() => {
                  const c = confirm
                  setConfirm(null)
                  if (c.kind === 'advance') void control('advance')
                  else if (c.kind === 'kick') void act('kick', c.playerId)
                  else if (c.kind === 'make-admin') void act('make-admin', c.playerId)
                  else void run(() => leagueApi.vacancyCancel(leagueId, c.code))
                }}
              >
                Confirmar
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Voltar
              </Button>
            </div>
          }
        >
          {confirm.kind === 'advance' && (
            <>
              <p className="text-sm text-muted">
                O tempo salta até o horário do jogo de {view?.next ? dateLabel(view.next.date) : '—'} ({view?.next ? whenLabel(view.next.startAt) : ''}). A partida <b>não</b> começa sozinha: ela espera todos os técnicos que jogam darem Pronto, e começa sozinha só se o prazo acabar.
              </p>
              {view?.next && view.next.notReady.length > 0 ? (
                <p className="mt-3 rounded-xl border border-amber/55 bg-amber/10 p-3 text-sm" data-testid="advance-not-ready">
                  Ainda não deram Pronto: {view.next.notReady.map(nick).join(', ')}
                </p>
              ) : (
                <p className="mt-3 text-sm text-win">Todos os técnicos com partida já deram Pronto: a partida começa assim que o tempo saltar.</p>
              )}
            </>
          )}
          {confirm.kind === 'kick' && <p className="text-sm text-muted">{nick(confirm.playerId)} sai da liga e o clube volta para a IA.</p>}
          {confirm.kind === 'make-admin' && <p className="text-sm text-muted">{nick(confirm.playerId)} vira o ADM da liga. Você continua como técnico, mas deixa de ver este painel.</p>}
          {confirm.kind === 'cancel-vacancy' && <p className="text-sm text-muted">O código deixa de valer e o clube volta a ficar livre para qualquer pessoa.</p>}
        </Sheet>
      )}

      {pacing && (
        <Sheet title="Ritmo da liga" onClose={() => setPacing(false)}>
          <p className="mb-3 text-sm text-muted">Muda a velocidade das próximas rodadas. O que já aconteceu não muda e os horários futuros são refeitos agora.</p>
          <div className="flex flex-col gap-2">
            {PACE_ORDER.map((p) => (
              <Button
                key={p}
                variant={p === league.pace ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => {
                  setPacing(false)
                  if (p !== league.pace) void run(() => leagueApi.pace(leagueId, p))
                }}
                data-testid={`pace-${p}`}
              >
                {PACE_LABELS[p]}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}
