import { useCallback, useEffect, useState } from 'react'
import type { ClubAction, ClubPlayer, ClubView } from '../../../../engine/league/club'
import type { Position } from '../../../../engine/types'
import { leagueApi } from '../../../../store/leagues'
import { Button, Card, Segmented } from '../../../components/ui'
import { formatMoney } from '../../../format'
import { LEAGUE_ERROR_LABELS, OFFER_REASON_LABELS, POSITION_SHORT_LABELS } from '../../../labels'
import { Sheet } from '../../../theme'

const YEARS = [1, 2, 3, 4, 5]
const pos = (p: string): string => POSITION_SHORT_LABELS[p as Position] ?? p
const dateLabel = (iso: string): string => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/**
 * "Meu clube" na liga em andamento (B8.7): a meta da diretoria, os contratos que vencem com a temporada (quem não for renovado sai na virada) e os jovens
 * da base que fizeram 20 anos (promover ou dispensar). As regras são as do jogo solo; a virada de temporada não mexe nos clubes humanos.
 */
export function ClubCard({ leagueId }: { leagueId: string }) {
  const [view, setView] = useState<ClubView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renewing, setRenewing] = useState<ClubPlayer | null>(null)
  const [years, setYears] = useState(2)

  const load = useCallback(async () => {
    const r = await leagueApi.club(leagueId)
    if (r.ok) setView(r.view)
    else setError(LEAGUE_ERROR_LABELS[r.error])
  }, [leagueId])
  useEffect(() => {
    void load()
  }, [load])

  const act = async (action: ClubAction): Promise<boolean> => {
    setBusy(true)
    setError(null)
    const r = await leagueApi.clubAction(leagueId, action)
    setBusy(false)
    if (r.ok) {
      setView(r.view)
      return true
    }
    const detail = r.detail as { reason?: keyof typeof OFFER_REASON_LABELS; minimumSalary?: number } | undefined
    if (r.error === 'club-refused' && detail?.reason) {
      setError(`${OFFER_REASON_LABELS[detail.reason]}${detail.minimumSalary ? ` Ele aceitaria a partir de ${formatMoney(detail.minimumSalary)} por mês.` : ''}`)
    } else setError(LEAGUE_ERROR_LABELS[r.error])
    return false
  }

  if (!view) return error ? <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">{error}</p> : null
  const { objective, lastSeason } = view

  return (
    <Card title="Meu clube">
      <div data-testid="club-card" className="flex flex-col gap-4">
        <div>
          <p className="text-sm">
            Meta da diretoria na temporada {view.seasonLabel}: <strong data-testid="club-objective">terminar em {objective.targetPosition}º</strong> ou melhor.
          </p>
          <p className="mt-1 text-xs text-muted">
            Elenco de {view.squadSize} jogadores · folha de {formatMoney(view.payroll)} por mês (orçamento de {formatMoney(view.salaryBudget)}).
            {lastSeason ? ` Temporada passada: ${lastSeason.finalPosition}º lugar${lastSeason.champion ? ', campeão' : ''}.` : ''}
          </p>
        </div>

        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Contratos que vencem em {dateLabel(view.seasonEnd)}</h3>
          {view.expiring.length === 0 ? (
            <p className="mt-1 text-sm text-muted" data-testid="no-expiring">Nenhum contrato vence com esta temporada.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">Quem não for renovado antes da virada de temporada sai do clube.</p>
              <ul className="mt-2 flex flex-col gap-2" data-testid="expiring-list">
                {view.expiring.map((p) => (
                  <li key={p.playerId} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted">
                        {pos(p.position)} · {p.age} anos · força {p.overall} · {formatMoney(p.salary)}/mês
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setError(null)
                        setYears(2)
                        setRenewing(p)
                      }}
                      data-testid={`renew-${p.playerId}`}
                    >
                      Renovar
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Base: jovens de 20 anos</h3>
          {view.academyPending.length === 0 ? (
            <p className="mt-1 text-sm text-muted" data-testid="no-youth">Nenhum jovem esperando decisão. A base tem {view.academySize} jogadores.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">Quem já fez 20 anos precisa ser promovido ou dispensado. Se você deixar passar, a regra da IA decide na virada seguinte.</p>
              <ul className="mt-2 flex flex-col gap-2" data-testid="youth-list">
                {view.academyPending.map((y) => (
                  <li key={y.playerId} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <span className="block truncate font-semibold">{y.name}</span>
                    <span className="block text-xs text-muted">
                      {pos(y.position)} · {y.age} anos · força {y.overall} · potencial {'★'.repeat(y.stars)}
                      {'☆'.repeat(5 - y.stars)}
                    </span>
                    <span className="mt-2 flex gap-2">
                      <Button disabled={busy} onClick={() => void act({ type: 'promote', playerId: y.playerId })} data-testid={`promote-${y.playerId}`}>
                        Promover
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void act({ type: 'release-youth', playerId: y.playerId })} data-testid={`release-${y.playerId}`}>
                        Dispensar
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {error && !renewing && <p className="text-sm text-loss" data-testid="club-error">{error}</p>}
      </div>

      {renewing && (
        <Sheet
          title={`Renovar ${renewing.name}`}
          onClose={() => setRenewing(null)}
          footer={
            <Button
              disabled={busy}
              onClick={async () => {
                if (await act({ type: 'renew', playerId: renewing.playerId, years })) setRenewing(null)
              }}
              data-testid="confirm-renew"
            >
              Renovar por {years} {years === 1 ? 'ano' : 'anos'}
            </Button>
          }
        >
          <p className="text-sm text-muted">
            Contrato atual: {formatMoney(renewing.salary)}/mês até {dateLabel(renewing.endDate)}. Ele pede {formatMoney(renewing.demand ?? renewing.salary)} por mês para ficar.
          </p>
          <p className="mb-1 mt-3 text-xs font-semibold text-muted">Duração</p>
          <Segmented value={years} options={YEARS.map((n) => ({ id: n, label: `${n} ${n === 1 ? 'ano' : 'anos'}` }))} onChange={setYears} />
          {error && <p className="mt-3 text-sm text-loss" data-testid="renew-error">{error}</p>}
        </Sheet>
      )}
    </Card>
  )
}
