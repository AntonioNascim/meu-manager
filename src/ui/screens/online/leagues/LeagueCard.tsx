import { useCallback, useEffect, useState } from 'react'
import type { LeagueStateBody } from '../../../../online/leagueApi'
import { leagueApi } from '../../../../store/leagues'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { Eyebrow, Panel } from '../../../theme'
import { hourLabel, inLabel, readyCount, whenLabel } from './LeagueRunning'

const POLL_MS = 5000
/** Partidas que já levaram o técnico à tela sozinhas (o cartão é remontado ao trocar de tela, então a memória fica fora dele). */
const autoOpened = new Set<string>()

/**
 * O cartão da liga no Painel (Fase 6C): no lugar do botão "Avançar" do jogo solo. Mostra a próxima rodada no fuso do aparelho, o "Pronto" de
 * quem tem partida nela e leva à sala (ADM: Avançar, Pausar, ritmo). Quem avança o tempo é a liga, não o técnico.
 */
export function LeagueCard({ leagueId, teamId, onOpen, onWatch, onCareer }: { leagueId: string; teamId: string; onOpen: () => void; onWatch: () => void; onCareer: () => void }) {
  const [body, setBody] = useState<LeagueStateBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const r = await leagueApi.state(leagueId)
    if (r.ok) setBody(r)
    else setError(LEAGUE_ERROR_LABELS[r.error])
  }, [leagueId])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const view = body?.view
  const me = view?.seats.find((s) => s.teamId === teamId)
  const locked = !!me && !!view?.current?.locked.includes(me.playerId)
  const playingNow = !!me && !!view?.current && !view.directResult && view.current.playing.includes(me.playerId) && !locked
  // Quando a partida começa (todos deram Pronto, ou o prazo acabou) o técnico que deu Pronto é levado para a tela dela, no minuto 0.
  const startKey = view?.current ? `${leagueId}:${view.current.date}:${view.current.startedAt}` : ''
  useEffect(() => {
    if (!view?.current || !playingNow || autoOpened.has(startKey)) return
    autoOpened.add(startKey)
    // Só leva à tela se a partida acabou de começar (quem abre o jogo no meio dela escolhe entrar).
    if (view.now - view.current.startedAt < 90_000) onWatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, playingNow])
  const ready = async () => {
    if (!me) return
    setBusy(true)
    const r = await leagueApi.ready(leagueId, !me.ready)
    if (!r.ok) setError(LEAGUE_ERROR_LABELS[r.error])
    await load()
    setBusy(false)
  }

  let status = error ?? 'Carregando a liga…'
  if (view) {
    if (view.paused) status = 'Liga pausada pelo ADM'
    else if (view.current) status = `Rodada em andamento (${view.current.all - view.current.pending} de ${view.current.all} partidas dos técnicos terminaram)`
    else if (view.next?.waiting) status = 'Jogo pronto · Agora'
    else if (view.next) status = `Próxima rodada: ${whenLabel(view.next.startAt)} (${inLabel(view.next.startAt - view.now)})`
    else status = 'Sem rodadas marcadas'
  }

  return (
    <div className="mt-5 space-y-2" data-testid="league-card">
      <Eyebrow>Liga online</Eyebrow>
      <Panel className="p-3">
        <p className="text-sm" data-testid="league-status">
          {status}
        </p>
        {view?.next?.waiting && !view.current && !view.paused && (
          <p className="mt-1 text-sm" data-testid="league-ready-counter">
            Pronto {readyCount(view).done}/{readyCount(view).total}
            {view.next.waiting.deadlineAt ? ` · Sozinho às ${hourLabel(view.next.waiting.deadlineAt)}` : ''}
          </p>
        )}
        {locked && (
          <p className="mt-2 text-xs font-semibold text-yellow-300" data-testid="league-locked">
            A partida começou sem o seu Pronto: a IA joga pelo seu time e você não entra no meio do jogo.
          </p>
        )}
        {me && view?.current && !view.directResult && view.current.playing.includes(me.playerId) && !locked && (
          <button type="button" onClick={onWatch} data-testid="league-watch" className="mt-3 flex min-h-14 w-full items-center justify-center rounded-xl bg-accent font-display text-2xl font-extrabold uppercase tracking-wide text-accent-ink transition active:scale-[0.98]">
            Entrar na partida
          </button>
        )}
        {me && view && !view.current && !view.paused && me.required && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void ready()}
            data-testid="league-ready"
            className={`mt-3 flex min-h-14 w-full items-center justify-center rounded-xl font-display text-2xl font-extrabold uppercase tracking-wide transition active:scale-[0.98] ${me.ready ? 'border border-accent text-accent' : 'bg-accent text-accent-ink'}`}
          >
            {me.ready ? 'Pronto! Toque para desfazer' : 'Estou pronto'}
          </button>
        )}
        {me && view && !view.current && !view.paused && !me.required && view.next && <p className="mt-2 text-xs text-muted">Seu clube não joga na próxima rodada. Não precisa dar Pronto.</p>}
        <button type="button" onClick={onCareer} data-testid="league-career" className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl border border-line text-sm font-bold">
          Minha carreira
        </button>
        <button type="button" onClick={onOpen} data-testid="league-open-room" className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-line text-sm font-bold">
          Sala da liga
        </button>
      </Panel>
    </div>
  )
}
