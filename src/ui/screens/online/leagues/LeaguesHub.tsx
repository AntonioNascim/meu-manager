import { useEffect, useState } from 'react'
import type { LeagueSummary } from '../../../../online/leagueApi'
import { accessOfAccount, useAccount } from '../../../../store/onlineAccount'
import { leagueApi } from '../../../../store/leagues'
import { Button } from '../../../components/ui'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { Frame, LeagueCard } from './parts'

/** Ligas online (B8.3): minhas ligas e os caminhos para criar, procurar e entrar com código. */
export function LeaguesHub({
  onBack,
  onOpen,
  onCreate,
  onDirectory,
  onCode,
}: {
  onBack: () => void
  onOpen: (id: string) => void
  onCreate: () => void
  onDirectory: () => void
  onCode: () => void
}) {
  const protectedMode = accessOfAccount(useAccount()) !== 'full'
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void leagueApi.mine().then((r) => {
      if (!alive) return
      if (r.ok) setLeagues(r.leagues)
      else setError(LEAGUE_ERROR_LABELS[r.error])
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <Frame eyebrow="Conta online" title="Ligas online" onBack={onBack}>
      <p className="text-sm text-muted">Jogue com outros técnicos no mesmo mundo: cada um assume um clube, e a IA comanda os outros.</p>
      <div className="flex flex-col gap-3">
        <Button onClick={onCreate}>Criar uma liga</Button>
        {!protectedMode && (
          <Button variant="secondary" onClick={onDirectory}>
            Procurar ligas abertas
          </Button>
        )}
        <Button variant="secondary" onClick={onCode}>
          Entrar com um código de convite
        </Button>
      </div>
      {protectedMode && (
        <p className="text-xs text-muted" data-testid="protected-note">
          Modo protegido: você joga em ligas de amigos, entrando por convite.
        </p>
      )}
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Minhas ligas</h2>
      {error && <p className="text-sm text-loss">{error}</p>}
      {leagues === null && !error && <p className="text-sm text-muted">Carregando…</p>}
      {leagues?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted" data-testid="no-leagues">
          Você ainda não está em nenhuma liga. Crie uma, procure uma aberta ou entre com o código de um amigo.
        </p>
      )}
      {leagues?.map((l) => (
        <LeagueCard key={l.id} league={l} onOpen={() => onOpen(l.id)} action="Abrir a sala" />
      ))}
    </Frame>
  )
}
