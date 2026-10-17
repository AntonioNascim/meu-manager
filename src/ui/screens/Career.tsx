import { coachOf, userTeam } from '../../store/game'
import type { Game } from '../../store/game'
import { Card } from '../components/ui'
import { JobList } from './career/JobList'

/** Carreira do técnico: reputação e propostas de outros clubes (de qualquer liga). */
export function Career({ game, onTaken }: { game: Game; onTaken: () => void }) {
  const team = userTeam(game)
  const coach = coachOf(game)
  return (
    <div className="space-y-4">
      <Card title="Sua carreira">
        <p className="text-sm text-slate-200">
          Reputação como técnico: <b>{coach.reputation.toFixed(1)}</b> (de 1 a 20). Ela sobe quando o {team.name} cumpre a meta e ganha títulos e cai quando você é demitido.
        </p>
        <p className="mt-1 text-xs text-muted">Os clubes que procuram técnico olham a sua reputação e a confiança que a diretoria tem em você hoje. As propostas mudam a cada mês.</p>
      </Card>
      <Card title="Propostas de outros clubes">
        <JobList game={game} onTaken={onTaken} empty="Nenhum clube com vaga se interessou por você neste mês." />
        <p className="mt-3 text-xs text-muted">Ao aceitar, você deixa o {team.name} agora: o elenco, o treino e as negociações passam a ser os do clube novo, e a liga dele passa a ser jogada lance a lance.</p>
      </Card>
    </div>
  )
}
