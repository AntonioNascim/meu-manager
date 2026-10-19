/** O caminho de um clube numa copa: o que aconteceu com ele em cada fase já sorteada (derivado das partidas). */
import type { Cup, Match, TeamId } from '../types'
import { stageList } from './plan'
import { cupMatches, groupTables, leaguePhaseTable, tiesOfStage } from './tie'

export interface PathStep {
  stage: string
  /** O resultado nessa fase, em texto curto ("2º do grupo B", "passou", "eliminado", "folga", "em andamento"). */
  result: string
  state: 'passed' | 'out' | 'playing' | 'bye'
}

const ordinal = (n: number) => `${n}º`

/** As fases em que o clube jogou (ou folgou) na copa, em ordem. Vazio se ele não está na copa. */
export function cupPath(matches: readonly Match[], cup: Cup, teamId: TeamId): PathStep[] {
  const own = cupMatches(matches, cup.id)
  const list = stageList(cup.spec)
  const out: PathStep[] = []
  cup.log.forEach((log, i) => {
    if (!log.teams.includes(teamId)) return
    const name = list[i]?.name ?? log.name
    const stageMatches = own.filter((m) => m.cup?.stage === i)
    const pending = stageMatches.some((m) => m.status !== 'finished')
    if (log.kind === 'knockout') {
      if (log.byes.includes(teamId)) return void out.push({ stage: name, result: 'folga', state: 'bye' })
      const tie = tiesOfStage(own, cup.spec, i).find((t) => t.teams.includes(teamId))
      if (!tie || !tie.finished) return void out.push({ stage: name, result: 'em andamento', state: 'playing' })
      return void out.push(tie.winnerId === teamId ? { stage: name, result: 'passou', state: 'passed' } : { stage: name, result: 'eliminado', state: 'out' })
    }
    const rows = log.kind === 'groups' ? groupTables(own, i).find((g) => g.rows.some((r) => r.teamId === teamId)) : undefined
    const table = log.kind === 'groups' ? rows?.rows : leaguePhaseTable(own, i)
    const position = (table ?? []).findIndex((r) => r.teamId === teamId) + 1
    const label = log.kind === 'groups' ? `${ordinal(position)} do grupo ${String.fromCharCode(64 + (rows?.group ?? 1))}` : `${ordinal(position)} na tabela`
    if (pending) return void out.push({ stage: name, result: `${label} até agora`, state: 'playing' })
    // Fase terminada: passou se aparece na fase seguinte (ou na que pula uma).
    const advanced = cup.log.slice(i + 1).some((l) => l.teams.includes(teamId))
    out.push({ stage: name, result: label, state: advanced || cup.winnerId === teamId ? 'passed' : 'out' })
  })
  return out
}
