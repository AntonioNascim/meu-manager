import { useEffect, useState } from 'react'
import type { LeagueSummary } from '../../../../online/leagueApi'
import { leagueApi } from '../../../../store/leagues'
import { Button } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { Frame, LeagueCard } from './parts'

/** Diretório de ligas abertas (B8.3): as mais novas primeiro, com entrada aberta e vaga. */
export function OpenLeagues({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null)
  const [next, setNext] = useState<number | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (before?: number) => {
    setBusy(true)
    const r = await leagueApi.listOpen(before)
    setBusy(false)
    if (!r.ok) return setError(LEAGUE_ERROR_LABELS[r.error])
    setLeagues((cur) => [...(before ? (cur ?? []) : []), ...r.leagues])
    setNext(r.next)
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <Frame eyebrow="Ligas online" title="Ligas abertas" onBack={onBack}>
      <p className="text-sm text-muted">Entre em qualquer uma que ainda tenha vaga. As de amigos não aparecem aqui: entre com o código do convite.</p>
      {error && <p className="text-sm text-loss">{error}</p>}
      {leagues === null && !error && <p className="text-sm text-muted">Carregando…</p>}
      {leagues?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted" data-testid="no-open-leagues">
          Nenhuma liga aberta com vaga agora. Que tal criar a sua?
        </p>
      )}
      {leagues?.map((l) => <LeagueCard key={l.id} league={l} onOpen={() => onOpen(l.id)} action="Ver e escolher um clube" />)}
      {next !== undefined && (
        <Button variant="secondary" disabled={busy} onClick={() => void load(next)}>
          Ver mais
        </Button>
      )}
    </Frame>
  )
}
