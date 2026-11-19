import { useState } from 'react'
import { TopTabs } from '../theme'
import { coachOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { Card } from '../components/ui'
import { JobList } from './career/JobList'
import { OnlineCareer } from './online/OnlineCareer'
import { CHALLENGE_GOAL_TEXT, CHALLENGE_TITLE_TEXT } from '../labels'
import { teamById } from '../../store/game'

const Stars = ({ n }: { n: number }) => (
  <span className="text-amber" role="img" aria-label={`${n} de 5 estrelas`}>
    {'★'.repeat(n)}
    <span className="text-white/20">{'★'.repeat(5 - n)}</span>
  </span>
)

/** Carreira do técnico: reputação e propostas de outros clubes (de qualquer liga). */
export function Career({ game, onTaken }: { game: Game; onTaken: () => void }) {
  const [tab, setTab] = useState<'career' | 'conquests'>('career')
  // Na liga online só há o histórico: o jeito de mudar de clube é pela demissão ou pela sala da liga.
  if (game.online) return <OnlineCareer leagueId={game.online.leagueId} />
  const team = userTeam(game)
  const coach = coachOf(game)
  return (
    <div className="space-y-4">
      <TopTabs value={tab} options={[{ id: 'career', label: 'Carreira' }, { id: 'conquests', label: 'Conquistas' }]} onChange={setTab} />
      {tab === 'career' && (
      <>
      <Card title="Sua carreira">
        <p className="text-sm text-slate-200">
          Reputação como técnico: <b>{coach.reputation.toFixed(1)}</b> (de 1 a 20). Ela sobe quando o {team.name} cumpre a meta e ganha títulos e cai quando você é demitido.
        </p>
        <p className="mt-1 text-xs text-muted">Os clubes que procuram técnico olham a sua reputação e a confiança que a diretoria tem em você hoje. As propostas mudam a cada mês.</p>
      </Card>
      </>
      )}
      {tab === 'conquests' && (
      <Card title="Conquistas">
        <div data-testid="conquests">
          {game.challenge && (
            <p className="mb-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-3 text-sm" data-testid="active-challenge">
              <b>Desafio em andamento:</b> {CHALLENGE_TITLE_TEXT(game.challenge.kind, teamById(game, game.challenge.teamId).name)}. {CHALLENGE_GOAL_TEXT(game.challenge)} Temporadas jogadas: {game.challenge.seasonsPlayed} de {game.challenge.seasons}. <Stars n={game.challenge.stars} />
            </p>
          )}
          {(game.conquests ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nenhuma conquista ainda. Os desafios cumpridos ficam registrados aqui, com as estrelas (sem prêmio).</p>
          ) : (
            <ul className="divide-y divide-line">
              {(game.conquests ?? []).map((c) => (
                <li key={`${c.id}:${c.year}`} className="flex items-center justify-between gap-2 py-2 text-sm" data-testid="conquest">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{CHALLENGE_TITLE_TEXT(c.kind, c.teamName)}</span>
                    <span className="block text-xs text-muted">
                      Cumprido em {c.year} · {c.seasonsTaken === 1 ? '1 temporada' : `${c.seasonsTaken} temporadas`}
                    </span>
                  </span>
                  <Stars n={c.stars} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      )}
      {tab === 'career' && (
      <Card title="Propostas de outros clubes">
        <JobList game={game} onTaken={onTaken} empty="Nenhum clube com vaga se interessou por você neste mês." />
        <p className="mt-3 text-xs text-muted">Ao aceitar, você deixa o {team.name} agora: o elenco, o treino e as negociações passam a ser os do clube novo, e a liga dele passa a ser jogada lance a lance.</p>
      </Card>
      )}
    </div>
  )
}
