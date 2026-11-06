import { useEffect, useState } from 'react'
import type { CupCard, CupsBody } from '../../../../engine/league/cupsView'
import { leagueApi } from '../../../../store/leagues'
import { Card } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { Pill } from './parts'

const STATE_TONE = { passed: 'win', out: 'warn', playing: 'accent', bye: 'muted' } as const

/**
 * Copas da liga online (B8.8): o caminho do meu clube em cada copa da temporada, as outras copas do mundo e os campeões das edições passadas. As copas
 * são as do mundo da liga (nacionais, continentais e mundiais); a partida de copa de um técnico é um evento como qualquer outro (Pronto, resultado direto
 * ou ao vivo, com prorrogação e pênaltis nos mata-matas).
 */
export function CupsCard({ leagueId, clubOf }: { leagueId: string; clubOf: (teamId: string) => string }) {
  const [cups, setCups] = useState<CupsBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void leagueApi.cups(leagueId).then((r) => {
      if (!alive) return
      if (r.ok) setCups(r.cups)
      else setError(LEAGUE_ERROR_LABELS[r.error])
    })
    return () => {
      alive = false
    }
  }, [leagueId])
  if (!cups) return error ? <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">{error}</p> : null
  if (cups.mine.length === 0 && cups.others.length === 0 && cups.history.length === 0) return null
  return (
    <Card title="Copas">
      <div className="flex flex-col gap-4" data-testid="cups-card">
        {cups.mine.map((c) => (
          <Mine key={c.id} cup={c} clubOf={clubOf} />
        ))}
        {cups.mine.length === 0 && <p className="text-sm text-muted" data-testid="no-cups">Seu clube não está em nenhuma copa nesta temporada.</p>}
        {cups.others.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Outras copas do mundo</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid="other-cups">
              {cups.others.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted">{c.finished && c.winnerId ? `campeão: ${clubOf(c.winnerId)}` : 'em andamento'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cups.history.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Campeões das edições passadas</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm" data-testid="cup-history">
              {cups.history.slice(0, 8).map((h) => (
                <li key={`${h.cupId}-${h.year}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{h.name} {h.year}</span>
                  <span className="shrink-0 text-xs text-muted">{clubOf(h.winnerId)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

function Mine({ cup, clubOf }: { cup: CupCard; clubOf: (teamId: string) => string }) {
  return (
    <div data-testid={`cup-${cup.id}`}>
      <p className="font-semibold">{cup.name}</p>
      <p className="text-xs text-muted">
        {cup.finished && cup.winnerId ? `Campeão: ${clubOf(cup.winnerId)}` : cup.alive ? 'Seu clube segue na copa.' : 'Seu clube foi eliminado.'}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1">
        {cup.steps.map((s, i) => (
          <li key={`${s.stage}-${i}`}>
            <Pill tone={STATE_TONE[s.state]}>
              {s.stage}: {s.result}
            </Pill>
          </li>
        ))}
      </ul>
    </div>
  )
}
