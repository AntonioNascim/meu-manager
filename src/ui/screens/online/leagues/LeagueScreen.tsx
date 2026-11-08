import { useCallback, useEffect, useState } from 'react'
import type { LeagueDetail } from '../../../../online/leagueApi'
import { leagueApi, useLeagueTeams } from '../../../../store/leagues'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { LeagueRunning } from './LeagueRunning'

/** A sala da liga dentro do jogo (Fase 6C): técnicos, Pronto, Avançar, Pausa e ritmo, com as telas do jogo no resto. */
export function LeagueScreen({ leagueId }: { leagueId: string }) {
  const [league, setLeague] = useState<LeagueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data: teams } = useLeagueTeams(league ?? undefined)
  const load = useCallback(async () => {
    const r = await leagueApi.get(leagueId)
    if (r.ok) setLeague(r.league)
    else setError(LEAGUE_ERROR_LABELS[r.error])
  }, [leagueId])
  useEffect(() => {
    void load()
  }, [load])
  if (!league) return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-muted">{error ?? 'Carregando a liga…'}</p>
  return (
    <div className="space-y-3" data-testid="league-screen">
      <div>
        <div className="title text-2xl">{league.name}</div>
        <div className="text-xs text-muted">Sala da liga</div>
      </div>
      <LeagueRunning league={league} teams={teams ?? undefined} onRefresh={() => void load()} />
    </div>
  )
}
