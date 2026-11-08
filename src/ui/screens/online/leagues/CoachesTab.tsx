import { useEffect, useState } from 'react'
import type { LeagueDetail } from '../../../../online/leagueApi'
import { leagueApi, useLeagueTeams } from '../../../../store/leagues'
import { Panel, Eyebrow } from '../../../theme'
import { LEAGUE_ERROR_LABELS } from '../../../labels'
import { LeagueMarket } from './LeagueMarket'

/**
 * Aba "Técnicos" do Mercado dentro do jogo (Fase 6C): só o que não existe no jogo solo, o negócio entre técnicos humanos da liga (proposta com dinheiro
 * reservado, contraproposta, prazo de 48 h, histórico público e denúncia). A compra e a venda com a IA são as abas do Mercado do jogo.
 */
export function CoachesTab({ leagueId, worldDate }: { leagueId: string; worldDate: string }) {
  const [league, setLeague] = useState<LeagueDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const { data: teams } = useLeagueTeams(league ?? undefined)
  useEffect(() => {
    void leagueApi.get(leagueId).then((r) => (r.ok ? setLeague(r.league) : setError(LEAGUE_ERROR_LABELS[r.error])))
  }, [leagueId])
  return (
    <Panel className="space-y-3 p-4" data-testid="coaches-tab">
      <Eyebrow>Entre técnicos</Eyebrow>
      <p className="text-sm text-muted">Jogadores de clubes de outros técnicos da liga só se negociam aqui: o outro técnico responde (até 48 h), com o dinheiro reservado e histórico público das transferências.</p>
      {error && <p className="text-sm text-loss">{error}</p>}
      <button type="button" disabled={!league} onClick={() => setOpen(true)} data-testid="open-coaches-market" className="min-h-12 w-full rounded-xl bg-accent font-bold text-accent-ink active:scale-95 disabled:opacity-40">
        Abrir o mercado entre técnicos
      </button>
      {open && league && <LeagueMarket league={league} teams={teams ?? undefined} worldDate={worldDate} onClose={() => setOpen(false)} />}
    </Panel>
  )
}
