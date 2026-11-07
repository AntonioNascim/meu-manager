import { ReportSheet } from './ReportSheet'
import { ReportProblem } from '../../../components/ReportProblem'
import { useCallback, useEffect, useState } from 'react'
import type { LeagueDetail } from '../../../../online/leagueApi'
import type { AdminAction } from '../../../../online/leagueApi'
import { leagueApi, useLeagueTeams } from '../../../../store/leagues'
import { Button, Card, TeamBadge } from '../../../components/ui'
import { BAND_LABELS, LEAGUE_ERROR_LABELS, LEAGUE_KIND_LABELS, LEAGUE_STATUS_LABELS, PACE_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'
import { ClubPicker } from './ClubPicker'
import { LeagueRunning } from './LeagueRunning'
import { Frame, Pill } from './parts'

const pretty = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`

/** Sala da liga (B8.3): quem está, o clube de cada um, o convite e os comandos do ADM; quem ainda não entrou escolhe o clube aqui. */
export function LeagueRoomScreen({ id, code, onBack }: { id: string; code?: string; onBack: () => void }) {
  const [league, setLeague] = useState<LeagueDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [problem, setProblem] = useState(false)
  const [reporting, setReporting] = useState<{ kind: 'nickname' | 'league'; target: string; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const { data: teams } = useLeagueTeams(league ?? undefined)

  const load = useCallback(async () => {
    let r = await leagueApi.get(id)
    // Liga de amigos que ainda não tem a pessoa: o convite por código mostra a sala.
    if (!r.ok && r.error === 'not-found' && code) r = await leagueApi.resolveCode(code)
    if (r.ok) {
      setLeague(r.league)
      setMissing(false)
    } else if (r.error === 'not-found' || r.error === 'wrong-code') setMissing(true)
    else setError(LEAGUE_ERROR_LABELS[r.error])
  }, [id, code])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 6000)
    return () => clearInterval(t)
  }, [load])

  const act = async (action: AdminAction, playerId?: string) => {
    setBusy(true)
    setError(null)
    const r = await leagueApi.admin(id, action, playerId)
    setBusy(false)
    if (r.ok) setLeague(r.league)
    else setError(LEAGUE_ERROR_LABELS[r.error])
  }

  const pick = async (teamId: string) => {
    setBusy(true)
    setPickError(null)
    const r = await leagueApi.join(id, teamId, code)
    setBusy(false)
    if (r.ok) {
      setLeague(r.league)
      setPicking(false)
    } else setPickError(LEAGUE_ERROR_LABELS[r.error])
  }

  const leave = async () => {
    setBusy(true)
    const r = await leagueApi.leave(id)
    setBusy(false)
    if (r.ok) onBack()
    else {
      setLeaving(false)
      setError(LEAGUE_ERROR_LABELS[r.error])
    }
  }

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      setError('Não foi possível copiar. Selecione o texto e copie à mão.')
    }
  }

  if (missing) {
    return (
      <Frame title="Liga não encontrada" onBack={onBack}>
        <p className="text-sm text-muted">Ela pode ter sido encerrada, ou o convite não vale mais.</p>
      </Frame>
    )
  }
  if (!league) return <Frame title="Carregando…" onBack={onBack}>{error ? <p className="text-sm text-loss">{error}</p> : null}</Frame>

  const member = league.myTeamId !== undefined
  if (picking && !member) return <ClubPicker league={league} busy={busy} error={pickError} onBack={() => setPicking(false)} onPick={(t) => void pick(t)} />
  const inviteCode = league.code
  const canJoin = !member && !league.entryClosed && league.humans < league.maxHumans
  const myClub = member ? teams?.byId.get(league.myTeamId as string) : undefined

  return (
    <Frame eyebrow={LEAGUE_KIND_LABELS[league.kind]} title={league.name} onBack={onBack}>
      <div className="flex flex-wrap gap-2">
        <Pill tone={league.status === 'running' ? 'win' : 'warn'}>{LEAGUE_STATUS_LABELS[league.status]}</Pill>
        <Pill>{league.world.source === 'real' ? 'Mundo real' : 'Mundo fictício'}</Pill>
        <Pill>
          {league.humans} de {league.maxHumans} técnicos
        </Pill>
        {league.entryClosed && <Pill tone="warn">Entrada fechada</Pill>}
      </div>
      <p className="text-xs text-muted">
        {PACE_LABELS[league.pace]} · {BAND_LABELS[league.band]} · {league.directResult ? 'Resultado direto' : 'Partidas ao vivo'}
      </p>
      {league.status === 'lobby' && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">A liga ainda não começou. Cada técnico escolhe um clube e o ADM inicia quando todos estiverem prontos.</p>}
      {league.status === 'running' && <LeagueRunning league={league} teams={teams ?? undefined} onRefresh={() => void load()} />}
      {league.status === 'running' && !member && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">Quem entra agora assume um clube livre.</p>}

      {league.isAdmin && inviteCode && (
        <Card title="Convite">
          <p className="text-center text-3xl font-bold tracking-[0.25em]" data-testid="invite-code-shown">
            {pretty(inviteCode)}
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void copy('code', inviteCode)}>
              {copied === 'code' ? 'Copiado!' : 'Copiar código'}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => void copy('link', `${window.location.origin}${window.location.pathname}?online=1&convite=${inviteCode}`)}>
              {copied === 'link' ? 'Copiado!' : 'Copiar link'}
            </Button>
          </div>
        </Card>
      )}

      <Card title={`Técnicos (${league.humans})`}>
        {league.members.length === 0 && <p className="text-sm text-muted">Ninguém escolheu clube ainda.</p>}
        <ul className="flex flex-col gap-2" data-testid="members">
          {league.members.map((m) => {
            const club = teams?.byId.get(m.teamId)
            return (
              <li key={m.playerId} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                {club ? <TeamBadge team={club.team} size="sm" /> : <span className="h-9 w-9 rounded-lg bg-line" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {m.nickname ?? 'Técnico'} {m.isAdmin && <span className="text-xs text-accent">ADM</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">{club ? `${club.team.name} · ${club.competition}` : m.teamId}</span>
                </span>
                {league.myTeamId !== m.teamId && (
                  <button type="button" className="min-h-12 rounded-lg px-2 text-xs text-muted hover:bg-surface" onClick={() => setReporting({ kind: 'nickname', target: m.playerId, title: `Denunciar o apelido ${m.nickname ?? 'Técnico'}` })} data-testid={`report-${m.nickname}`}>
                    Denunciar
                  </button>
                )}
                {league.isAdmin && !m.isAdmin && (
                  <span className="flex gap-1">
                    <button type="button" className="min-h-12 rounded-lg px-2 text-xs text-muted hover:bg-surface" disabled={busy} onClick={() => void act('make-admin', m.playerId)}>
                      Passar ADM
                    </button>
                    <button type="button" className="min-h-12 rounded-lg px-2 text-xs text-loss hover:bg-surface" disabled={busy} onClick={() => void act('kick', m.playerId)} data-testid={`kick-${m.nickname}`}>
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
        <p role="alert" className="text-sm text-loss" data-testid="room-error">
          {error}
        </p>
      )}

      {member ? (
        <p className="text-sm">
          Seu clube: <b>{myClub?.team.name ?? league.myTeamId}</b>
        </p>
      ) : canJoin ? (
        <Button onClick={() => setPicking(true)} data-testid="pick-club">
          Escolher meu clube
        </Button>
      ) : (
        <p className="text-sm text-muted">{league.entryClosed ? 'A entrada está fechada.' : 'A liga está cheia.'}</p>
      )}

      {league.isAdmin && (
        <Card title={league.status === 'running' ? 'Entrada e convite' : 'Controles do ADM'}>
          <div className="flex flex-col gap-2">
            {league.status === 'lobby' && (
              <Button disabled={busy || league.humans < 1} onClick={() => void act('start')} data-testid="start-league">
                Iniciar a liga
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => void act(league.entryClosed ? 'open-entry' : 'close-entry')}>
              {league.entryClosed ? 'Reabrir a entrada' : 'Fechar a entrada'}
            </Button>
            {league.kind === 'friends' && (
              <Button variant="secondary" disabled={busy} onClick={() => void act('rotate-code')}>
                Trocar o código de convite
              </Button>
            )}
          </div>
        </Card>
      )}

      {(member || league.isAdmin) && (
        <button type="button" className="min-h-12 rounded-xl border border-loss font-bold text-loss" onClick={() => setLeaving(true)}>
          Sair da liga
        </button>
      )}

      {member && (
        <button type="button" className="min-h-12 rounded-xl text-sm text-muted" onClick={() => setReporting({ kind: 'league', target: league.id, title: 'Denunciar esta liga' })} data-testid="report-league">
          Denunciar esta liga
        </button>
      )}

      <button type="button" className="min-h-12 rounded-xl text-sm text-muted underline" onClick={() => setProblem(true)} data-testid="report-problem">
        Relatar problema
      </button>
      {problem && <ReportProblem context={{ screen: 'sala da liga', mode: 'online', worldSource: league.world.source, phase: league.status, leagueId: league.id }} onClose={() => setProblem(false)} />}

      {reporting && <ReportSheet kind={reporting.kind} target={reporting.target} title={reporting.title} onClose={() => setReporting(null)} />}

      {leaving && (
        <Sheet
          title="Sair da liga?"
          onClose={() => setLeaving(false)}
          footer={
            <div className="flex flex-col gap-3">
              <button type="button" disabled={busy} className="min-h-12 rounded-xl border border-loss font-bold text-loss" onClick={() => void leave()} data-testid="confirm-leave">
                {busy ? 'Saindo…' : 'Sair da liga'}
              </button>
              <Button variant="secondary" onClick={() => setLeaving(false)}>
                Ficar
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted">Seu clube volta para a IA. {league.isAdmin ? 'Como você é o ADM, o técnico mais antigo da liga assume o cargo. ' : ''}Para voltar, é preciso entrar de novo e escolher um clube livre.</p>
        </Sheet>
      )}
    </Frame>
  )
}
