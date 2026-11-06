import { useEffect, useState } from 'react'
import type { BuyerRow, MineBody, MineRow, PreRow } from '../../../../engine/league/sellmarket'
import type { LeagueDetail, SaleOutcome } from '../../../../online/leagueApi'
import { leagueApi, type LeagueTeam } from '../../../../store/leagues'
import type { Position } from '../../../../engine/types'
import { Button, Card, Segmented } from '../../../components/ui'
import { formatMoney } from '../../../format'
import { INTEREST_COLORS, INTEREST_LABELS, OFFER_REASON_LABELS, POSITION_SHORT_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'
import type { Act } from './LeagueMarketAi'
import { Pill } from './parts'

type Teams = { byId: Map<string, LeagueTeam> } | undefined
const pos = (p: string): string => POSITION_SHORT_LABELS[p as Position] ?? p
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const clubName = (teams: Teams, id: string): string => teams?.byId.get(id)?.team.shortName ?? teams?.byId.get(id)?.team.name ?? id
const round10k = (n: number) => Math.max(10_000, Math.round(n / 10_000) * 10_000)
const reasonOf = (code: string | undefined): string => (code ? (OFFER_REASON_LABELS[code as keyof typeof OFFER_REASON_LABELS] ?? 'O negócio foi recusado.') : 'O negócio foi recusado.')

/** Resposta do clube ou do jogador, para mostrar na própria janela. */
function Outcome({ sale, perMonth }: { sale: SaleOutcome | null; perMonth?: boolean }) {
  if (!sale || sale.accepted) return null
  return (
    <p className="mt-3 rounded-xl border border-loss/40 bg-loss/10 p-2 text-sm text-loss" data-testid="sale-refused">
      {reasonOf(sale.reason)}
      {sale.counter ? ` ${perMonth ? 'Ele aceitaria a partir de' : 'Máximo que o clube paga:'} ${formatMoney(sale.counter)}${perMonth ? ' por mês' : ''}.` : ''}
    </p>
  )
}

/** Meus jogadores: anunciar (a IA passa a fazer propostas pelo preço anunciado) e vender ou emprestar direto a um clube da IA. */
export function MineTab({ mine, teams, busy, act, id }: { league: LeagueDetail; mine: MineBody | null; teams: Teams; busy: boolean; act: Act; id: string }) {
  const [sell, setSell] = useState<MineRow | null>(null)
  const [listing, setListing] = useState<MineRow | null>(null)
  if (!mine) return <p className="text-sm text-muted">Carregando o elenco…</p>
  return (
    <>
      {!mine.windowOpen && <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-2 text-sm text-yellow-300">A janela de transferências do seu clube está fechada: dá para anunciar, mas a venda só vale com a janela aberta.</p>}
      <p className="text-xs text-muted">Anuncie um jogador para atrair propostas dos clubes da IA pelo preço que você pedir, ou venda direto a um clube interessado (ele responde na hora). Emprestados de outro clube não podem ser vendidos.</p>
      <ul className="flex flex-col gap-2" data-testid="mine-list">
        {mine.players.map((p) => (
          <li key={p.playerId} className="rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid={`mine-${p.playerId}`}>
            <span className="block truncate font-semibold">{p.name}</span>
            <span className="block text-xs text-muted">
              {pos(p.position)} · {p.age} anos · força {p.overall} · valor {formatMoney(p.value)} · {formatMoney(p.salary)}/mês até {dateLabel(p.endDate)}
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              {p.listing && <Pill tone="accent">{p.listing.kind === 'loan' ? 'Empréstimo' : 'À venda'} por {formatMoney(p.listing.price)}</Pill>}
              {p.loaned && <Pill>Emprestado</Pill>}
              {p.leaving && <Pill tone="warn">Sai na virada (pré-contrato)</Pill>}
            </span>
            {!p.loaned && (
              <span className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => setSell(p)} data-testid={`sell-${p.playerId}`}>
                  Negociar
                </Button>
                {p.listing ? (
                  <Button variant="secondary" disabled={busy} onClick={() => void act(() => leagueApi.tradeUnlist(id, p.playerId))} data-testid={`unlist-${p.playerId}`}>
                    Tirar anúncio
                  </Button>
                ) : (
                  <Button variant="secondary" disabled={busy} onClick={() => setListing(p)} data-testid={`list-${p.playerId}`}>
                    Anunciar
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {listing && <ListSheet row={listing} busy={busy} act={act} id={id} onClose={() => setListing(null)} />}
      {sell && <SellSheet row={sell} teams={teams} busy={busy} act={act} id={id} windowOpen={mine.windowOpen} onClose={() => setSell(null)} />}
    </>
  )
}

function ListSheet({ row, busy, act, id, onClose }: { row: MineRow; busy: boolean; act: Act; id: string; onClose: () => void }) {
  const [kind, setKind] = useState<'transfer' | 'loan'>('transfer')
  const [price, setPrice] = useState(row.suggestSale)
  const base = kind === 'loan' ? row.suggestLoan : row.suggestSale
  const range = { min: round10k(base * 0.5), max: round10k(base * 2) }
  return (
    <Sheet
      title={`Anunciar: ${row.name}`}
      onClose={onClose}
      footer={
        <Button
          disabled={busy}
          onClick={async () => {
            if (await act(() => leagueApi.tradeList(id, { playerId: row.playerId, kind, price }))) onClose()
          }}
          data-testid="confirm-list"
        >
          Anunciar por {formatMoney(price)}
        </Button>
      }
    >
      <p className="text-sm text-muted">Valor de mercado {formatMoney(row.value)}. Preço menor atrai mais propostas; as propostas chegam na aba Propostas.</p>
      <div className="mt-3">
        <Segmented
          value={kind}
          options={[
            { id: 'transfer' as const, label: 'Venda' },
            { id: 'loan' as const, label: 'Empréstimo' },
          ]}
          onChange={(k) => {
            setKind(k)
            setPrice(k === 'loan' ? row.suggestLoan : row.suggestSale)
          }}
        />
      </div>
      <p className="mb-1 mt-3 text-xs font-semibold text-muted">{kind === 'loan' ? 'Taxa do empréstimo' : 'Preço pedido'}</p>
      <input type="range" min={range.min} max={range.max} step={10_000} value={Math.min(Math.max(price, range.min), range.max)} onChange={(e) => setPrice(Number(e.target.value))} className="w-full" data-testid="list-price" />
      <p className="text-center text-lg font-bold">{formatMoney(price)}</p>
    </Sheet>
  )
}

function SellSheet({ row, teams, busy, act, id, windowOpen, onClose }: { row: MineRow; teams: Teams; busy: boolean; act: Act; id: string; windowOpen: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<'purchase' | 'loan'>('purchase')
  const [buyers, setBuyers] = useState<BuyerRow[] | null>(null)
  const [buyerId, setBuyerId] = useState('')
  const [fee, setFee] = useState<number | null>(null)
  const [sale, setSale] = useState<SaleOutcome | null>(null)
  useEffect(() => {
    setBuyers(null)
    setBuyerId('')
    setFee(null)
    setSale(null)
    void leagueApi.tradeBuyers(id, row.playerId, kind).then((r) => setBuyers(r.ok && r.buyers ? r.buyers : []))
  }, [id, row.playerId, kind])
  const chosen = buyers?.find((b) => b.teamId === buyerId)
  const value = fee ?? chosen?.maxFee ?? 0
  return (
    <Sheet
      title={`Negociar: ${row.name}`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {!windowOpen && <p className="text-sm text-amber-300">Janela fechada: a venda só vale com a janela aberta.</p>}
          <Outcome sale={sale} />
          <Button
            disabled={busy || !chosen || !windowOpen}
            onClick={async () => {
              if (!chosen) return
              let result: SaleOutcome | null = null
              const ok = await act(() => leagueApi.tradeSell(id, { playerId: row.playerId, buyerId: chosen.teamId, kind, fee: value }), undefined, (r) => (result = r.sale ?? null))
              setSale(result)
              if (ok && (result as SaleOutcome | null)?.accepted) onClose()
            }}
            data-testid="confirm-sell"
          >
            {kind === 'loan' ? 'Emprestar' : 'Vender'} por {formatMoney(value)}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        Valor de mercado {formatMoney(row.value)} · salário {formatMoney(row.salary)}/mês
      </p>
      <div className="mt-3">
        <Segmented
          value={kind}
          options={[
            { id: 'purchase' as const, label: 'Vender' },
            { id: 'loan' as const, label: 'Emprestar' },
          ]}
          onChange={setKind}
        />
      </div>
      <label className="mt-3 block text-sm">
        Clube interessado
        <select
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold"
          value={buyerId}
          onChange={(e) => {
            setBuyerId(e.target.value)
            setFee(null)
            setSale(null)
          }}
          data-testid="buyer-select"
        >
          <option value="">{buyers === null ? 'Procurando clubes…' : buyers.length ? 'Escolha um clube' : 'Nenhum clube interessado'}</option>
          {buyers?.map((b) => (
            <option key={b.teamId} value={b.teamId}>
              {clubName(teams, b.teamId)} · até {formatMoney(b.maxFee)}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <label className="mt-3 block text-sm">
          {kind === 'loan' ? 'Taxa do empréstimo' : 'Valor da venda'}
          <input type="number" min={0} step={10_000} className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 font-bold" value={value} onChange={(e) => setFee(Number(e.target.value))} data-testid="sell-fee" />
        </label>
      )}
    </Sheet>
  )
}

/** Pré-contrato: jogadores de clubes da IA no último ano de contrato chegam de graça na virada, se aceitarem o salário. */
export function PreTab({ mine, teams, busy, act, id }: { mine: MineBody | null; teams: Teams; busy: boolean; act: Act; id: string }) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<PreRow[] | null>(null)
  const [pick, setPick] = useState<PreRow | null>(null)
  const search = async () => {
    const r = await leagueApi.tradePre(id, query.trim() ? { query: query.trim() } : {})
    if (r.ok && r.pre) setRows(r.pre)
  }
  useEffect(() => {
    void search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine?.arriving.length])
  const leaving = mine?.players.filter((p) => p.leaving) ?? []
  return (
    <>
      <p className="text-xs text-muted">
        {mine?.preOpen
          ? 'Os pré-contratos estão abertos: quem está nos últimos meses de contrato pode combinar com outro clube e chegar de graça na virada de temporada. O jogador responde na hora.'
          : 'Os pré-contratos ainda não abriram. Eles abrem nos últimos meses de contrato dos jogadores (em geral a partir do meio da temporada).'}
      </p>
      {(mine?.arriving.length ?? 0) > 0 && (
        <Card title="Chegam na virada">
          <ul className="flex flex-col gap-2" data-testid="pre-arriving">
            {mine?.arriving.map((a) => (
              <li key={a.playerId} className="text-sm">
                <span className="font-semibold">{a.name}</span>
                <span className="block text-xs text-muted">
                  {pos(a.position)} · de {clubName(teams, a.fromTeamId)} · {formatMoney(a.salary)}/mês por {a.years} {a.years === 1 ? 'ano' : 'anos'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {leaving.length > 0 && (
        <Card title="Saem na virada">
          <ul className="flex flex-col gap-2" data-testid="pre-leaving">
            {leaving.map((p) => (
              <li key={p.playerId} className="text-sm">
                <span className="font-semibold">{p.name}</span>
                <span className="block text-xs text-muted">vai para {p.leaving ? clubName(teams, p.leaving.toTeamId) : ''} de graça</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void search()} placeholder="Nome, apelido" maxLength={40} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" data-testid="pre-text" />
        <Button variant="secondary" onClick={() => void search()} data-testid="pre-go">
          Buscar
        </Button>
      </div>
      {rows && rows.length === 0 && <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">Nenhum jogador com pré-contrato disponível agora.</p>}
      <ul className="flex flex-col gap-2" data-testid="pre-list">
        {rows?.map((r) => (
          <li key={r.playerId} className="rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid={`pre-${r.playerId}`}>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-muted">
                  {pos(r.position)} · {r.age} anos · força {r.overall} · {clubName(teams, r.clubId)} · contrato até {dateLabel(r.endDate)}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${INTEREST_COLORS[r.interest]}`}>{INTEREST_LABELS[r.interest]}</span>
            </span>
            <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => setPick(r)} data-testid={`pre-pick-${r.playerId}`}>
              Propor pré-contrato
            </Button>
          </li>
        ))}
      </ul>
      {pick && <PreSheet row={pick} busy={busy} act={act} id={id} onClose={() => setPick(null)} />}
    </>
  )
}

function PreSheet({ row, busy, act, id, onClose }: { row: PreRow; busy: boolean; act: Act; id: string; onClose: () => void }) {
  const [salary, setSalary] = useState(row.salaryHint)
  const [years, setYears] = useState(3)
  const [sale, setSale] = useState<SaleOutcome | null>(null)
  return (
    <Sheet
      title={`Pré-contrato: ${row.name}`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Outcome sale={sale} perMonth />
          <Button
            disabled={busy}
            onClick={async () => {
              let result: SaleOutcome | null = null
              const ok = await act(() => leagueApi.tradePreOffer(id, { playerId: row.playerId, salary, years }), (min) => setSalary(min), (r) => (result = r.sale ?? null))
              setSale(result)
              if (ok && (result as SaleOutcome | null)?.accepted) onClose()
            }}
            data-testid="send-pre"
          >
            Propor {formatMoney(salary)}/mês
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">
        Sem taxa: ele chega de graça quando o contrato atual acabar. Hoje ele ganha {formatMoney(row.salary)}/mês. Interesse: {INTEREST_LABELS[row.interest]}.
      </p>
      <p className="mb-1 mt-3 text-xs font-semibold text-muted">Salário por mês</p>
      <input type="range" min={Math.max(1_000, Math.round(row.salaryHint * 0.5))} max={Math.round(row.salaryHint * 3)} step={1_000} value={salary} onChange={(e) => setSalary(Number(e.target.value))} className="w-full" data-testid="pre-salary" />
      <p className="text-center text-lg font-bold">{formatMoney(salary)}</p>
      <p className="mb-1 mt-3 text-xs font-semibold text-muted">Contrato por</p>
      <Segmented value={years} options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: `${n} ${n === 1 ? 'ano' : 'anos'}` }))} onChange={setYears} />
    </Sheet>
  )
}
