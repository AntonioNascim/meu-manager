import { useCallback, useEffect, useState } from 'react'
import type { AiOfferRow, AiSearchFilters, MarketRow } from '../../../../engine/league/aimarket'
import type { LeagueDetail, TradeReply } from '../../../../online/leagueApi'
import type { Answer } from '../../../../online/leagueClient'
import { leagueApi, type LeagueTeam } from '../../../../store/leagues'
import type { Position } from '../../../../engine/types'
import { Button, Card, Segmented } from '../../../components/ui'
import { formatMoney } from '../../../format'
import { INTEREST_COLORS, INTEREST_LABELS, MARKET_SORT_LABELS, OFFER_REASON_LABELS, POSITION_SHORT_LABELS, QUICK_FILTER_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'
import { Pill } from './parts'

type Body = Omit<Extract<TradeReply, { ok: true }>, 'ok'>
export type Act = (call: () => Promise<Answer<Body>>, onRefuse?: (minimumSalary: number) => void, onReply?: (reply: Body) => void) => Promise<boolean>
type Teams = { byId: Map<string, LeagueTeam> } | undefined

const pos = (p: string): string => POSITION_SHORT_LABELS[p as Position] ?? p
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const endAfter = (worldDate: string, years: number): string => `${Number(worldDate.slice(0, 4)) + years}-12-31`
const clubName = (teams: Teams, id: string | null): string => (id === null ? 'Livre' : (teams?.byId.get(id)?.team.shortName ?? teams?.byId.get(id)?.team.name ?? id))
const round10k = (n: number) => Math.max(10_000, Math.round(n / 10_000) * 10_000)

const GROUPS: { id: NonNullable<AiSearchFilters['group']>; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'GK', label: 'Gol' },
  { id: 'DEF', label: 'Defesa' },
  { id: 'MID', label: 'Meio' },
  { id: 'FWD', label: 'Ataque' },
]
const QUICKS: NonNullable<AiSearchFilters['quick']> = ['budget', 'bargain', 'prospect', 'expiring']
const SORTS = ['overall', 'age', 'value-desc', 'value-asc', 'salary'] as const

/** Lista de jogadores (busca ou anúncios) e a janela para propor a um clube da IA ou contratar um livre. */
function Rows({ rows, teams, worldDate, busy, act, id, windowOpen, empty, testId }: { rows: MarketRow[] | null; teams: Teams; worldDate: string; busy: boolean; act: Act; id: string; windowOpen: boolean; empty: string; testId: string }) {
  const [pick, setPick] = useState<MarketRow | null>(null)
  const [kind, setKind] = useState<'purchase' | 'loan'>('purchase')
  const [fee, setFee] = useState(0)
  const [salary, setSalary] = useState(0)
  const [years, setYears] = useState(2)
  const free = pick?.clubId === null
  const open = (r: MarketRow) => {
    setKind(r.listing?.kind === 'loan' ? 'loan' : 'purchase')
    setFee(r.listing ? r.listing.price : r.asking)
    setSalary(r.salaryHint)
    setYears(2)
    setPick(r)
  }
  const baseFee = pick ? (kind === 'loan' ? pick.loanAsking : (pick.listing?.price ?? pick.asking)) : 0
  const range = { min: round10k(baseFee * 0.6), max: round10k(baseFee * 1.8) }
  return (
    <>
      {rows && rows.length === 0 && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">{empty}</p>}
      <ul className="flex flex-col gap-2" data-testid={testId}>
        {rows?.map((r) => (
          <li key={r.playerId} className="rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid={`row-${r.playerId}`}>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-muted">
                  {pos(r.position)} · {r.age} anos · força {r.overall} · {clubName(teams, r.clubId)}
                </span>
                <span className="block text-xs text-muted">
                  {r.clubId === null ? 'Livre' : `Valor ${formatMoney(r.value)} · pede ${formatMoney(r.asking)}`} · {formatMoney(r.salary)}/mês até {dateLabel(r.endDate)}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${INTEREST_COLORS[r.interest]}`}>{INTEREST_LABELS[r.interest]}</span>
            </span>
            {r.listing && <Pill tone="accent">{r.listing.kind === 'loan' ? 'Empréstimo' : 'À venda'} por {formatMoney(r.listing.price)}</Pill>}
            <span className="mt-2 flex">
              <Button variant="secondary" disabled={busy || !windowOpen} onClick={() => open(r)} data-testid={`pick-${r.playerId}`}>
                {r.clubId === null ? 'Contratar' : 'Fazer proposta'}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {pick && (
        <Sheet
          title={`${free ? 'Contratar' : kind === 'loan' ? 'Emprestar' : 'Comprar'}: ${pick.name}`}
          onClose={() => setPick(null)}
          footer={
            <Button
              disabled={busy}
              onClick={async () => {
                const contractEnd = endAfter(worldDate, years)
                const ok = await act(
                  () => (free ? leagueApi.tradeSign(id, { playerId: pick.playerId, salary, contractEnd }) : leagueApi.tradeAiOffer(id, { kind, playerId: pick.playerId, fee, salary, contractEnd })),
                  (min) => setSalary(min),
                )
                if (ok) setPick(null)
              }}
              data-testid="send-ai-offer"
            >
              {free ? `Contratar por ${formatMoney(salary)}/mês` : `Enviar proposta de ${formatMoney(fee)}`}
            </Button>
          }
        >
          {free ? (
            <p className="text-sm text-muted">Jogador livre: sem taxa, só o salário. A resposta é na hora.</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                {clubName(teams, pick.clubId)} pede {formatMoney(kind === 'loan' ? pick.loanAsking : pick.asking)}. O clube decide quando a liga passar pela data da resposta; o dinheiro só sai se ele aceitar.
              </p>
              {!pick.listing && (
                <div className="mt-3">
                  <Segmented value={kind} options={[{ id: 'purchase' as const, label: 'Compra' }, { id: 'loan' as const, label: 'Empréstimo' }]} onChange={(k) => (setKind(k), setFee(k === 'loan' ? pick.loanAsking : pick.asking))} />
                </div>
              )}
              <p className="mb-1 mt-3 text-xs font-semibold text-muted">{kind === 'loan' ? 'Taxa do empréstimo' : 'Preço'}</p>
              <input type="range" min={range.min} max={range.max} step={10_000} value={Math.min(Math.max(fee, range.min), range.max)} onChange={(e) => setFee(Number(e.target.value))} className="w-full" data-testid="ai-fee" />
              <p className="text-center text-lg font-bold">{formatMoney(fee)}</p>
            </>
          )}
          <p className="mb-1 mt-3 text-xs font-semibold text-muted">Salário por mês (o jogador precisa aceitar; interesse: {INTEREST_LABELS[pick.interest]})</p>
          <input type="range" min={Math.max(1_000, Math.round(pick.salaryHint * 0.5))} max={Math.round(pick.salaryHint * 3)} step={1_000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="w-full" data-testid="ai-salary" />
          <p className="text-center text-lg font-bold">{formatMoney(salary)}</p>
          <p className="mb-1 mt-3 text-xs font-semibold text-muted">{kind === 'loan' && !free ? 'Até' : 'Contrato por'}</p>
          <Segmented value={years} options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: `${n} ${n === 1 ? 'ano' : 'anos'}` }))} onChange={setYears} />
        </Sheet>
      )}
    </>
  )
}

/** Busca com os filtros do jogo solo: texto, posição, só livres, atalhos e ordem. */
export function SearchTab({ league, teams, worldDate, busy, act, windowOpen }: { league: LeagueDetail; teams: Teams; worldDate: string; busy: boolean; act: Act; windowOpen: boolean }) {
  const id = league.id
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<NonNullable<AiSearchFilters['group']>>('all')
  const [onlyFree, setOnlyFree] = useState(false)
  const [quick, setQuick] = useState<NonNullable<AiSearchFilters['quick']>>([])
  const [sort, setSort] = useState<(typeof SORTS)[number]>('overall')
  const [ageMax, setAgeMax] = useState(0)
  const [rows, setRows] = useState<MarketRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const search = useCallback(async () => {
    setLoading(true)
    const f: AiSearchFilters = { sort, ...(query.trim() ? { query: query.trim() } : {}), ...(group !== 'all' ? { group } : {}), ...(onlyFree ? { situation: 'free' as const } : {}), ...(quick.length ? { quick } : {}), ...(ageMax > 0 ? { ageMax } : {}) }
    const r = await leagueApi.tradeSearch(id, f)
    setLoading(false)
    if (r.ok && r.rows) setRows(r.rows)
  }, [id, query, group, onlyFree, quick, sort, ageMax])
  useEffect(() => {
    void search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, onlyFree, quick, sort, ageMax])
  return (
    <>
      {!windowOpen && <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-2 text-sm text-yellow-300">A janela de transferências está fechada: dá para pesquisar, mas não para propor.</p>}
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} placeholder="Nome, apelido ou clube" maxLength={40} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" data-testid="search-text" />
        <Button variant="secondary" onClick={() => void search()} disabled={loading} data-testid="search-go">Buscar</Button>
      </div>
      <Segmented value={group} options={GROUPS} onChange={setGroup} />
      <div className="flex flex-wrap gap-2" data-testid="search-quick">
        <button type="button" onClick={() => setOnlyFree(!onlyFree)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${onlyFree ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`} data-testid="search-free">Só livres</button>
        {QUICKS.map((q) => (
          <button key={q} type="button" onClick={() => setQuick(quick.includes(q) ? quick.filter((x) => x !== q) : [...quick, q])} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${quick.includes(q) ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`} data-testid={`quick-${q}`}>
            {QUICK_FILTER_LABELS[q]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <select value={sort} onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-sm" aria-label="Ordem" data-testid="search-sort">
          {SORTS.map((s) => (
            <option key={s} value={s}>{MARKET_SORT_LABELS[s]}</option>
          ))}
        </select>
        <select value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className="min-h-11 rounded-lg border border-line bg-bg px-2 text-sm" aria-label="Idade máxima" data-testid="search-age">
          <option value={0}>Qualquer idade</option>
          {[21, 23, 25, 28, 32].map((a) => (
            <option key={a} value={a}>Até {a} anos</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted">Aparecem jogadores de clubes da IA e livres, os 40 primeiros. Jogador de outro técnico da liga: aba Técnicos.</p>
      <Rows rows={rows} teams={teams} worldDate={worldDate} busy={busy} act={act} id={id} windowOpen={windowOpen} empty="Nenhum jogador com estes filtros." testId="search-list" />
    </>
  )
}

/** Anúncios dos clubes da IA: o preço anunciado vale na compra. */
export function ListingsTab({ league, teams, worldDate, busy, act, windowOpen }: { league: LeagueDetail; teams: Teams; worldDate: string; busy: boolean; act: Act; windowOpen: boolean }) {
  const [rows, setRows] = useState<MarketRow[] | null>(null)
  useEffect(() => {
    void leagueApi.tradeListings(league.id).then((r) => r.ok && r.rows && setRows(r.rows))
  }, [league.id])
  return (
    <>
      <p className="text-xs text-muted">Clubes da IA anunciam, aos poucos, quem sobra no elenco. Pelo preço anunciado a compra costuma passar; a lista se renova a cada rodada de negociações.</p>
      <Rows rows={rows} teams={teams} worldDate={worldDate} busy={busy} act={act} id={league.id} windowOpen={windowOpen} empty="Nenhum anúncio agora. Eles aparecem com o passar das rodadas." testId="listing-list" />
    </>
  )
}

const STATUS: Record<string, string> = { pending: 'Aguardando a resposta do clube', accepted: 'Aceita', rejected: 'Recusada', withdrawn: 'Retirada', expired: 'Vencida' }

/** As minhas propostas a clubes da IA e as propostas da IA pelos meus jogadores. */
export function AiOffers({ ai, teams, busy, act, id }: { ai: { outgoing: AiOfferRow[]; incoming: AiOfferRow[] } | null; teams: Teams; busy: boolean; act: Act; id: string }) {
  if (!ai || (ai.outgoing.length === 0 && ai.incoming.length === 0)) return null
  const reason = (o: AiOfferRow) => (o.reason && (o.status === 'rejected' || o.status === 'withdrawn') ? ` · ${OFFER_REASON_LABELS[o.reason]}${o.counter ? ` (mínimo ${formatMoney(o.counter)}${o.reason === 'fee' ? '' : '/mês'})` : ''}` : '')
  return (
    <>
      {ai.incoming.length > 0 && (
        <Card title="Propostas da IA pelos seus jogadores">
          <ul className="flex flex-col gap-3" data-testid="ai-incoming">
            {ai.incoming.map((o) => (
              <li key={o.id} className="text-sm" data-testid={`ai-in-${o.id}`}>
                <span className="font-semibold">{clubName(teams, o.otherId)} quer {o.playerName}</span>
                <span className="block text-xs text-muted">
                  {o.kind === 'loan' ? 'Empréstimo' : 'Compra'} por {formatMoney(o.fee)} · vale até {dateLabel(o.dueOn)} (data do jogo)
                </span>
                <span className="mt-2 flex gap-2">
                  <Button disabled={busy} onClick={() => void act(() => leagueApi.tradeAiRespond(id, o.id, true))} data-testid={`ai-accept-${o.id}`}>Aceitar</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void act(() => leagueApi.tradeAiRespond(id, o.id, false))} data-testid={`ai-decline-${o.id}`}>Recusar</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {ai.outgoing.length > 0 && (
        <Card title="Minhas propostas a clubes da IA">
          <ul className="flex flex-col gap-3" data-testid="ai-outgoing">
            {ai.outgoing.map((o) => (
              <li key={o.id} className="text-sm" data-testid={`ai-out-${o.id}`}>
                <span className="font-semibold">{o.kind === 'loan' ? 'Empréstimo' : o.otherId === null ? 'Contratação' : 'Compra'} de {o.playerName}</span>
                <span className="block text-xs text-muted">
                  {clubName(teams, o.otherId)} · {o.otherId === null ? 'sem taxa' : formatMoney(o.fee)} · {formatMoney(o.salary)}/mês · {STATUS[o.status] ?? o.status}
                  {o.status === 'pending' ? ` (resposta em ${dateLabel(o.dueOn)})` : reason(o)}
                </span>
                {o.status === 'pending' && (
                  <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => void act(() => leagueApi.tradeAiWithdraw(id, o.id))} data-testid={`ai-withdraw-${o.id}`}>Retirar</Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
