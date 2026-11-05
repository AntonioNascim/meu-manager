import { useMemo, useState } from 'react'
import type { LeagueDetail } from '../../../../online/leagueApi'
import { useLeagueTeams, type LeagueTeam } from '../../../../store/leagues'
import { Button, TeamBadge } from '../../../components/ui'
import { Sheet } from '../../../theme'
import { Frame } from './parts'

const SHOWN = 60
const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Escolha do clube numa liga (B8.3): qualquer clube de qualquer liga do mundo; os que já têm técnico aparecem bloqueados. */
export function ClubPicker({ league, busy, error, onBack, onPick }: { league: LeagueDetail; busy: boolean; error: string | null; onBack: () => void; onPick: (teamId: string) => void }) {
  const { data, error: loadError } = useLeagueTeams(league)
  const [query, setQuery] = useState('')
  const [competition, setCompetition] = useState('')
  const [chosen, setChosen] = useState<LeagueTeam | null>(null)
  const taken = useMemo(() => new Map(league.members.map((m) => [m.teamId, m.nickname ?? 'outro técnico'])), [league.members])

  const competitions = useMemo(() => [...new Set((data?.teams ?? []).map((t) => t.competition))], [data])
  const list = useMemo(() => {
    const q = fold(query.trim())
    return (data?.teams ?? [])
      .filter((t) => (competition === '' || t.competition === competition) && (q === '' || fold(t.team.name).includes(q) || fold(t.team.abbreviation).includes(q) || fold(t.team.city).includes(q)))
      .sort((a, b) => b.team.reputation - a.team.reputation)
  }, [data, query, competition])

  return (
    <Frame eyebrow={league.name} title="Escolha seu clube" onBack={onBack}>
      {loadError && <p className="text-sm text-loss">{loadError}</p>}
      {!data && !loadError && <p className="text-sm text-muted">Carregando os clubes do mundo da liga…</p>}
      {data && (
        <>
          <input
            className="min-h-12 rounded-xl bg-surface-2 px-4 ring-1 ring-line"
            placeholder="Buscar clube, sigla ou cidade"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            data-testid="club-search"
          />
          <select className="min-h-12 rounded-xl bg-surface-2 px-3 ring-1 ring-line" value={competition} onChange={(e) => setCompetition(e.target.value)} aria-label="Liga">
            <option value="">Todas as ligas ({data.teams.length} clubes)</option>
            {competitions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ul className="flex flex-col gap-2" data-testid="club-list">
            {list.slice(0, SHOWN).map((t) => {
              const by = taken.get(t.team.id)
              return (
                <li key={t.team.id}>
                  <button
                    type="button"
                    disabled={by !== undefined}
                    onClick={() => setChosen(t)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left disabled:opacity-50"
                    data-testid={`club-${t.team.id}`}
                  >
                    <TeamBadge team={t.team} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{t.team.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {t.competition} · {t.team.city}
                      </span>
                    </span>
                    {by !== undefined ? <span className="text-xs text-muted">Técnico: {by}</span> : <span className="text-xs text-muted">Rep. {t.team.reputation}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {list.length > SHOWN && <p className="text-center text-xs text-muted">Mostrando {SHOWN} de {list.length}. Use a busca para achar outros.</p>}
          {list.length === 0 && <p className="text-center text-sm text-muted">Nenhum clube com esse filtro.</p>}
        </>
      )}
      {chosen && (
        <Sheet
          title={`Assumir o ${chosen.team.name}?`}
          onClose={() => setChosen(null)}
          footer={
            <div className="flex flex-col gap-3">
              <Button
                disabled={busy}
                onClick={() => {
                  onPick(chosen.team.id)
                }}
              >
                {busy ? 'Entrando…' : 'Assumir este clube'}
              </Button>
              <Button variant="secondary" onClick={() => setChosen(null)}>
                Escolher outro
              </Button>
            </div>
          }
        >
          <div className="flex items-center gap-3">
            <TeamBadge team={chosen.team} size="md" />
            <div>
              <p className="font-bold">{chosen.team.name}</p>
              <p className="text-sm text-muted">
                {chosen.competition} · {chosen.team.city}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">Você será o técnico deste clube na liga {league.name}. Depois de entrar, só dá para trocar de clube saindo e entrando de novo.</p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-loss" data-testid="pick-error">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </Frame>
  )
}
