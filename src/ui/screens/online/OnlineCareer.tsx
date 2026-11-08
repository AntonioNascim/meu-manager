import { useEffect, useState } from 'react'
import type { CareerRow } from '../../../engine/league/career'
import { leagueCareer } from '../../../online/leagueClient'
import { ONLINE_CONFIG } from '../../../online/config'
import { getAccount } from '../../../store/onlineAccount'
import { Card } from '../../components/ui'
import { formatDate } from '../../format'

const END_LABELS = { dismissed: 'Demitido', moved: 'Mudou de clube' } as const

/** Carreira do técnico na liga online (Fase 6C, C6): só o histórico, clube a clube, com as temporadas fechadas e a campanha de hoje. */
export function OnlineCareer({ leagueId }: { leagueId: string }) {
  const [rows, setRows] = useState<CareerRow[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const identity = getAccount().account?.identity
    if (!identity) return setError(true)
    const d = { base: ONLINE_CONFIG.apiBase, fetchFn: (...a: Parameters<typeof fetch>) => fetch(...a), now: Date.now, randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)) }
    void leagueCareer(d, identity, leagueId).then((r) => (r.ok ? setRows(r.rows) : setError(true)))
  }, [leagueId])
  if (error) return <Card><p className="text-sm text-muted">Não consegui carregar a carreira agora.</p></Card>
  if (!rows) return <p className="text-sm text-muted">Carregando a carreira…</p>
  return (
    <div className="space-y-3" data-testid="online-career">
      <Card title="Sua carreira nesta liga">
        <p className="text-sm text-muted">Cada passagem por um clube, da mais recente para a mais antiga.</p>
      </Card>
      {rows.map((r, i) => (
        <Card key={`${r.teamId}-${r.since}-${i}`}>
          <div className="flex items-baseline justify-between gap-2">
            <b className="truncate">{r.teamName}</b>
            <span className="text-xs text-muted">
              {formatDate(r.since)} {r.until ? `a ${formatDate(r.until)}` : 'até hoje'}
            </span>
          </div>
          {r.ended && <p className="text-xs font-bold text-loss">{END_LABELS[r.ended]}</p>}
          {r.current && (
            <p className="mt-1 text-sm">
              Hoje: {r.current.position}º lugar, {r.current.points} pts em {r.current.played} jogos
            </p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {r.seasons.map((s) => (
              <li key={s.year} className="flex justify-between">
                <span>{s.year}</span>
                <span>
                  {s.finalPosition}º lugar{s.champion ? ' · campeão' : ''}
                </span>
              </li>
            ))}
            {r.seasons.length === 0 && <li className="text-muted">Nenhuma temporada fechada ainda.</li>}
          </ul>
        </Card>
      ))}
      {rows.length === 0 && <p className="text-sm text-muted">A carreira começa quando você assume um clube.</p>}
    </div>
  )
}
