import { useCallback, useEffect, useState } from 'react'
import type { SquadRow, TradeBody, TradeOfferView, TradeRecord } from '../../../../engine/league/trade'
import type { LeagueDetail, TradeReply } from '../../../../online/leagueApi'
import type { Answer } from '../../../../online/leagueClient'
import { leagueApi, type LeagueTeam } from '../../../../store/leagues'
import { Button, Card, Segmented, Tabs } from '../../../components/ui'
import { formatMoney } from '../../../format'
import { LEAGUE_ERROR_LABELS, OFFER_REASON_LABELS, POSITION_SHORT_LABELS, TRADE_ERROR_LABELS, TRADE_STATUS_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'
import type { Position } from '../../../../engine/types'
import { inLabel } from './LeagueRunning'
import { Pill } from './parts'

type Tab = 'offers' | 'coaches' | 'history'
type Body = Omit<Extract<TradeReply, { ok: true }>, 'ok'>
const POLL_MS = 8000
const pos = (p: string): string => POSITION_SHORT_LABELS[p as Position] ?? p
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const reasonText = (code: string): string => TRADE_ERROR_LABELS[code] ?? OFFER_REASON_LABELS[code as keyof typeof OFFER_REASON_LABELS] ?? 'O mercado recusou este negócio.'

/** "2029-12-31" daqui a `years` anos do dia do mundo. */
const endAfter = (worldDate: string, years: number): string => `${Number(worldDate.slice(0, 4)) + years}-12-31`

/**
 * Mercado entre técnicos da liga (B8.6): propostas com dinheiro reservado e contrapropostas, elencos dos outros técnicos, jogadores livres e o histórico público
 * (com denúncia). O servidor aplica todas as regras (janela, limite de estrangeiros, faixa de preço, limites por par de técnicos); a tela só mostra e pede.
 */
export function LeagueMarket({ league, teams, worldDate, onClose }: { league: LeagueDetail; teams?: { byId: Map<string, LeagueTeam> }; worldDate: string; onClose: () => void }) {
  const id = league.id
  const [tab, setTab] = useState<Tab>('coaches')
  const [body, setBody] = useState<TradeBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clubOf = (teamId: string | null): string => (teamId === null ? 'Livre' : (teams?.byId.get(teamId)?.team.shortName ?? teams?.byId.get(teamId)?.team.name ?? teamId))
  const nick = (playerId: string): string => league.members.find((m) => m.playerId === playerId)?.nickname ?? 'Técnico'

  const load = useCallback(async () => {
    const r = await leagueApi.tradeBody(id)
    if (r.ok && r.body) setBody(r.body)
    else if (!r.ok) setError(LEAGUE_ERROR_LABELS[r.error])
  }, [id])
  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  /** Roda uma decisão; a resposta traz o painel novo. Devolve se deu certo. */
  const act = async (call: () => Promise<Answer<Body>>, onRefuse?: (minimumSalary: number) => void, onReply?: (reply: Body) => void): Promise<boolean> => {
    setBusy(true)
    setError(null)
    const r = await call()
    setBusy(false)
    if (r.ok) {
      if (r.body) setBody(r.body)
      onReply?.(r)
      return true
    }
    const d = r.detail as { reason?: string; minimumSalary?: number } | undefined
    if (d?.minimumSalary && onRefuse) onRefuse(d.minimumSalary)
    setError(r.error === 'trade-refused' && d?.reason ? `${reasonText(d.reason)}${d.minimumSalary ? ` Ele aceitaria a partir de ${formatMoney(d.minimumSalary)} por mês.` : ''}` : LEAGUE_ERROR_LABELS[r.error])
    return false
  }

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-bg" data-testid="league-market">
      <div className="mx-auto max-w-md space-y-3 px-3 pb-10">
        <div className="sticky top-0 z-10 -mx-3 space-y-2 bg-bg/95 px-3 pb-2 pt-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={onClose} data-testid="market-back">Voltar</Button>
            <h1 className="title text-xl">Mercado</h1>
            {body && <Pill tone={body.windowOpen ? 'win' : 'warn'}>{body.windowOpen ? 'Janela aberta' : 'Janela fechada'}</Pill>}
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              // A compra, a venda e o pré-contrato com a IA são as abas do Mercado do jogo do clube; aqui só o que é entre técnicos da liga.
              { id: 'coaches', label: 'Técnicos' },
              { id: 'offers', label: 'Propostas' },
              { id: 'history', label: 'Histórico' },
            ]}
          />
          {error && <p className="rounded-xl border border-loss/40 bg-loss/10 p-2 text-sm text-loss" data-testid="market-error">{error}</p>}
        </div>
        {!body ? <p className="text-sm text-muted">Carregando o mercado…</p> : null}
        {body && tab === 'offers' && (
          <>
            <Offers body={body} busy={busy} nick={nick} clubOf={clubOf} act={act} id={id} myTeamId={league.myTeamId} />
          </>
        )}
        {body && tab === 'coaches' && <Coaches league={league} clubOf={clubOf} worldDate={worldDate} busy={busy} act={act} id={id} windowOpen={body.windowOpen} />}
        {body && tab === 'history' && <History body={body} clubOf={clubOf} act={act} id={id} isAdmin={league.isAdmin} />}
      </div>
    </div>
  )
}

function Offers({ body, busy, nick, clubOf, act, id, myTeamId }: { myTeamId?: string; body: TradeBody; busy: boolean; nick: (p: string) => string; clubOf: (t: string | null) => string; act: (c: () => Promise<Answer<Body>>, onRefuse?: (minimumSalary: number) => void) => Promise<boolean>; id: string }) {
  const [counter, setCounter] = useState<TradeOfferView | null>(null)
  const [fee, setFee] = useState(0)
  const open = body.offers.filter((o) => o.status === 'open')
  const closed = body.offers.filter((o) => o.status !== 'open').slice(-8).reverse()
  return (
    <>
      <p className="text-xs text-muted" data-testid="market-reserved">
        {body.reserved > 0 ? `${formatMoney(body.reserved)} do seu orçamento de compras está reservado nas propostas abertas. ` : ''}
        Propostas abertas como comprador: {body.openAsBuyer} de 5. Cada proposta vale 48 h (24 h por contraproposta); o prazo congela se a liga for pausada.
      </p>
      {open.length === 0 && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted" data-testid="no-offers">Nenhuma proposta aberta com técnicos da liga. Procure jogadores na aba "Buscar" ou veja os elencos na aba "Técnicos".</p>}
      <ul className="flex flex-col gap-3" data-testid="offers-list">
        {open.map((o) => {
          const iAmBuyer = o.buyer.teamId === myTeamId
          return (
            <li key={o.id} className="rounded-2xl border border-line bg-surface p-3 text-sm" data-testid={`offer-${o.id}`}>
              <p className="font-semibold">
                {o.kind === 'loan' ? 'Empréstimo' : 'Compra'} de {o.playerName}
              </p>
              <p className="mt-1 text-xs text-muted">
                {nick(o.buyer.playerId)} ({clubOf(o.buyer.teamId)}) quer o jogador de {nick(o.seller.playerId)} ({clubOf(o.seller.teamId)}) · {formatMoney(o.fee)} · salário {formatMoney(o.salary)}/mês até {dateLabel(o.contractEnd)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Faixa permitida: {formatMoney(o.min)} a {formatMoney(o.max)} · {o.round > 0 ? `${o.round}ª contraproposta · ` : ''}vence {inLabel(o.left)}
              </p>
              {o.mine ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => void act(() => leagueApi.tradeRespond(id, o.id, 'accept'))} data-testid={`accept-${o.id}`}>Aceitar</Button>
                  <Button variant="secondary" disabled={busy || o.round >= 3} onClick={() => (setFee(o.fee), setCounter(o))} data-testid={`counter-${o.id}`}>Contrapropor</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void act(() => leagueApi.tradeRespond(id, o.id, 'decline'))} data-testid={`decline-${o.id}`}>Recusar</Button>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <Pill>Aguardando resposta de {nick(o.turn === 'seller' ? o.seller.playerId : o.buyer.playerId)}</Pill>
                  {iAmBuyer && (
                    <Button variant="secondary" disabled={busy} onClick={() => void act(() => leagueApi.tradeWithdraw(id, o.id))} data-testid={`withdraw-${o.id}`}>Retirar</Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {closed.length > 0 && (
        <Card title="Encerradas">
          <ul className="flex flex-col gap-2 text-sm" data-testid="closed-offers">
            {closed.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{o.playerName}</span>
                <span className="shrink-0 text-xs text-muted">
                  {TRADE_STATUS_LABELS[o.status]}
                  {o.reason ? ` · ${reasonText(o.reason)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {counter && (
        <Sheet
          title={`Contraproposta por ${counter.playerName}`}
          onClose={() => setCounter(null)}
          footer={
            <Button
              disabled={busy || fee < counter.min || fee > counter.max}
              onClick={async () => {
                if (await act(() => leagueApi.tradeRespond(id, counter.id, 'counter', fee))) setCounter(null)
              }}
              data-testid="confirm-counter"
            >
              Enviar contraproposta de {formatMoney(fee)}
            </Button>
          }
        >
          <p className="text-sm text-muted">Valor de mercado do jogador: {formatMoney(counter.value)}. Faixa permitida: {formatMoney(counter.min)} a {formatMoney(counter.max)}.</p>
          <input type="range" min={counter.min} max={counter.max} step={10_000} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="mt-4 w-full" data-testid="counter-fee" />
          <p className="mt-2 text-center text-lg font-bold">{formatMoney(fee)}</p>
        </Sheet>
      )}
    </>
  )
}

function Coaches({ league, clubOf, worldDate, busy, act, id, windowOpen }: { league: LeagueDetail; clubOf: (t: string | null) => string; worldDate: string; busy: boolean; act: (c: () => Promise<Answer<Body>>, onRefuse?: (minimumSalary: number) => void) => Promise<boolean>; id: string; windowOpen: boolean }) {
  const others = league.members.filter((m) => m.teamId && m.teamId !== league.myTeamId)
  const [squad, setSquad] = useState<{ teamId: string; rows: SquadRow[] } | null>(null)
  const [pick, setPick] = useState<{ row: SquadRow; kind: 'purchase' | 'loan' } | null>(null)
  const [fee, setFee] = useState(0)
  const [salary, setSalary] = useState(0)
  const [years, setYears] = useState(2)
  const open = async (teamId: string) => {
    const r = await leagueApi.tradeSquad(id, teamId)
    if (r.ok && r.squad) setSquad({ teamId, rows: r.squad })
  }
  if (others.length === 0) return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">Ainda não há outros técnicos com clube nesta liga.</p>
  return (
    <>
      {!windowOpen && <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-2 text-sm text-yellow-300">A janela de transferências está fechada: dá para ver os elencos, mas não para propor.</p>}
      <ul className="flex flex-col gap-2" data-testid="coach-list">
        {others.map((m) => (
          <li key={m.playerId}>
            <button type="button" onClick={() => void open(m.teamId as string)} className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3 text-left" data-testid={`coach-${m.playerId}`}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{m.nickname}</span>
                <span className="block truncate text-xs text-muted">{clubOf(m.teamId as string)}</span>
              </span>
              <span className="text-xs text-muted">Ver elenco</span>
            </button>
          </li>
        ))}
      </ul>
      {squad && (
        <Sheet title={`Elenco: ${clubOf(squad.teamId)}`} onClose={() => setSquad(null)}>
          <ul className="flex flex-col gap-2" data-testid="coach-squad">
            {squad.rows.map((r) => (
              <li key={r.playerId} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-muted">
                  {pos(r.position)} · {r.age} anos · força {r.overall} · {formatMoney(r.salary)}/mês até {dateLabel(r.endDate)} · valor {formatMoney(r.value)}
                </span>
                {r.loaned ? (
                  <span className="mt-1 block text-xs text-muted">Emprestado: não pode ser negociado.</span>
                ) : (
                  <span className="mt-2 flex gap-2">
                    <Button
                      disabled={busy || !windowOpen}
                      onClick={() => {
                        setFee(Math.round((r.buy.min + r.buy.max) / 2 / 10_000) * 10_000)
                        setSalary(Math.round((r.salary * 1.2) / 1_000) * 1_000)
                        setYears(2)
                        setPick({ row: r, kind: 'purchase' })
                      }}
                      data-testid={`buy-${r.playerId}`}
                    >
                      Comprar
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy || !windowOpen}
                      onClick={() => {
                        setFee(Math.round((r.loan.min + r.loan.max) / 2 / 10_000) * 10_000)
                        setSalary(r.salary)
                        setYears(1)
                        setPick({ row: r, kind: 'loan' })
                      }}
                      data-testid={`loan-${r.playerId}`}
                    >
                      Emprestar
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {pick && (
        <Sheet
          title={`${pick.kind === 'loan' ? 'Empréstimo' : 'Compra'}: ${pick.row.name}`}
          onClose={() => setPick(null)}
          footer={
            <Button
              disabled={busy}
              onClick={async () => {
                const ok = await act(() => leagueApi.tradeOffer(id, { kind: pick.kind, playerId: pick.row.playerId, fee, salary, contractEnd: endAfter(worldDate, years) }), (min) => setSalary(min))
                if (ok) {
                  setPick(null)
                  setSquad(null)
                }
              }}
              data-testid="send-offer"
            >
              Enviar proposta de {formatMoney(fee)}
            </Button>
          }
        >
          {(() => {
            const range = pick.kind === 'loan' ? pick.row.loan : pick.row.buy
            return (
              <>
                <p className="text-sm text-muted">
                  Valor de mercado {formatMoney(pick.row.value)}. O preço precisa ficar entre {formatMoney(range.min)} e {formatMoney(range.max)}. O dinheiro fica reservado enquanto a proposta estiver aberta.
                </p>
                <p className="mb-1 mt-3 text-xs font-semibold text-muted">{pick.kind === 'loan' ? 'Taxa do empréstimo' : 'Preço'}</p>
                <input type="range" min={range.min} max={range.max} step={10_000} value={Math.min(Math.max(fee, range.min), range.max)} onChange={(e) => setFee(Number(e.target.value))} className="w-full" data-testid="offer-fee" />
                <p className="text-center text-lg font-bold">{formatMoney(fee)}</p>
                <p className="mb-1 mt-3 text-xs font-semibold text-muted">Salário por mês (o jogador precisa aceitar)</p>
                <input type="range" min={Math.max(1_000, Math.round(pick.row.salary * 0.5))} max={Math.round(pick.row.salary * 3)} step={1_000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="w-full" data-testid="offer-salary" />
                <p className="text-center text-lg font-bold">{formatMoney(salary)}</p>
                <p className="mb-1 mt-3 text-xs font-semibold text-muted">{pick.kind === 'loan' ? 'Até' : 'Contrato por'}</p>
                <Segmented value={years} options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: `${n} ${n === 1 ? 'ano' : 'anos'}` }))} onChange={setYears} />
              </>
            )
          })()}
        </Sheet>
      )}
    </>
  )
}

function History({ body, clubOf, act, id, isAdmin }: { body: TradeBody; clubOf: (t: string | null) => string; act: (c: () => Promise<Answer<Body>>, onRefuse?: (minimumSalary: number) => void) => Promise<boolean>; id: string; isAdmin: boolean }) {
  const [reporting, setReporting] = useState<TradeRecord | null>(null)
  const count = (rid: string) => body.reports.filter((r) => r.recordId === rid).length
  return (
    <>
      <p className="text-xs text-muted">Todas as transferências entre técnicos e contratações de jogador livre desta liga, as mais recentes primeiro. Viu algo combinado só para passar dinheiro? Toque em Denunciar: o ADM da liga é avisado.</p>
      {body.history.length === 0 && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted" data-testid="no-history">Ainda não houve transferências nesta liga.</p>}
      <ul className="flex flex-col gap-2" data-testid="history-list">
        {body.history.map((r) => (
          <li key={r.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="block font-semibold">{r.playerName}</span>
            <span className="block text-xs text-muted">
              {r.kind === 'free' ? 'Contratado livre' : r.kind === 'loan' ? 'Emprestado' : 'Vendido'} · {clubOf(r.fromTeamId)} → {clubOf(r.toTeamId)} · {r.fee > 0 ? formatMoney(r.fee) : 'sem taxa'} · {dateLabel(r.date)}
            </span>
            <span className="mt-1 flex items-center gap-2">
              {r.kind !== 'free' && (
                <button type="button" className="text-xs font-semibold text-muted underline" onClick={() => setReporting(r)} data-testid={`report-${r.id}`}>Denunciar</button>
              )}
              {isAdmin && count(r.id) > 0 && <Pill tone="warn">{count(r.id)} denúncia(s)</Pill>}
            </span>
          </li>
        ))}
      </ul>
      {reporting && (
        <Sheet title="Denunciar transferência" onClose={() => setReporting(null)}>
          <p className="mb-3 text-sm text-muted">{reporting.playerName}: {clubOf(reporting.fromTeamId)} → {clubOf(reporting.toTeamId)}. Escolha o motivo.</p>
          <div className="flex flex-col gap-2">
            {(['laranja', 'abusivo', 'outro'] as const).map((reason) => (
              <Button
                key={reason}
                variant="secondary"
                onClick={async () => {
                  if (await act(() => leagueApi.tradeReport(id, reporting.id, reason))) setReporting(null)
                }}
                data-testid={`report-reason-${reason}`}
              >
                {reason === 'laranja' ? 'Combinado para passar dinheiro' : reason === 'abusivo' ? 'Preço abusivo' : 'Outro motivo'}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}
