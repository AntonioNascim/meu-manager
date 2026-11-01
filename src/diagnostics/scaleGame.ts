/**
 * Jogo de teste pelo caminho que o jogo de verdade faz: o pacote de exemplo (21 ligas, calendários de cada país, copas nacionais,
 * continentais e mundiais) validado, montado em mundo e iniciado por `createGame`, com o foco no Brasil (só a pirâmide do técnico é
 * lance a lance). É o que a tela `?diagnostico=1` mede; o `buildScaleGame` de `scaleWorld.ts` (sem copas e sem calendários) fica para
 * as ferramentas que comparam ligas.
 */
import { DEFAULT_CUPS, normalizeCup } from '../data/package/cups'
import { loadWorld } from '../data/package/defaultPackage'
import { validatePackage } from '../data/package/validate'
import type { SeasonState } from '../engine/season'
import type { Game } from '../store/game'
import { createGame } from '../store/game'
import { buildScaleGame, BRAZIL_ONLY } from './scaleWorld'
import { buildScalePackage } from './scalePackage'

export type ScaleWorldChoice = 'full' | 'brazil' | 'real'

/**
 * O jogo de teste de um dos mundos: `full` = o pacote fictício de 21 ligas (358 clubes); `brazil` = as três séries do Brasil com as copas do país;
 * `real` = o pacote real (`data/pacote-real.json`, 370 clubes), que quem chama entrega já lido em `rawPackage` (a tela escolhe o arquivo; as ferramentas leem do disco).
 */
export function buildDiagnosticGame(choice: ScaleWorldChoice, seed: number, rawPackage?: unknown): { game: Game; genMs: number; seasonMs: number } {
  if (choice === 'brazil') {
    // Sem calendários nem copas de outros países; as copas do Brasil (a nacional e a supercopa) entram como no jogo.
    const built = buildScaleGame(BRAZIL_ONLY, seed, { cupSpecs: DEFAULT_CUPS.map((c) => normalizeCup(c)) })
    return built
  }
  let t = performance.now()
  if (choice === 'real' && !rawPackage) throw new Error('falta o pacote real (escolha data/pacote-real.json)')
  const { pkg, report } = validatePackage(choice === 'real' ? rawPackage : JSON.parse(JSON.stringify(buildScalePackage(seed))))
  if (!pkg) throw new Error(choice === 'real' ? `pacote real inválido: ${report.errors.slice(0, 3).map((i) => `${i.code} ${i.path}`).join('; ')}` : 'pacote de exemplo inválido')
  const world = loadWorld(seed, pkg)
  const genMs = performance.now() - t
  const userTeamId = (world.competitions?.find((c) => c.id === 'br-1')?.teams[7] ?? world.teams[0])!.id
  t = performance.now()
  const created = createGame(seed, userTeamId, { world, dataPackage: pkg })
  const seasonMs = performance.now() - t
  // A diretoria não demite: o objetivo é medir custo, não desempenho.
  const season: SeasonState = { ...created.season, teams: created.season.teams.map((tm) => (tm.id === userTeamId ? { ...tm, objective: { targetPosition: 20, sackingPosition: 20 } } : tm)) }
  return { game: { ...created, season }, genMs, seasonMs }
}
