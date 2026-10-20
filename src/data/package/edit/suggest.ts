import { overallForPosition } from '../../../engine/overall'
import type { Position } from '../../../engine/types'
import { DEFAULT_START_YEAR } from '../../generateWorld'
import { leagueSetup } from '../load'
import { generateRealPlayer } from '../realPlayer'
import type { DataPackage, PackageClub, PackageLeague, PackagePlayer } from '../types'

/** Índices de um pacote para achar clube e liga sem varrer as listas a cada jogador (guardados por pacote). */
export interface PackageIndex {
  clubById: Map<string, PackageClub>
  leagueById: Map<string, PackageLeague>
}

const indexes = new WeakMap<DataPackage, PackageIndex>()

export function indexPackage(pkg: DataPackage): PackageIndex {
  let index = indexes.get(pkg)
  if (!index) {
    index = { clubById: new Map(pkg.clubs.map((c) => [c.id, c])), leagueById: new Map(pkg.leagues.map((l) => [l.id, l])) }
    indexes.set(pkg, index)
  }
  return index
}

/** Dados que o jogo gera para um jogador sem eles. */
export type SuggestedData = Required<Pick<PackagePlayer, 'attributes' | 'potential' | 'hidden' | 'contract'>>

/**
 * O que o jogo geraria para o jogador a partir da posição, da idade e do nível do clube (reputação, divisão e economia da
 * liga): é exatamente o que ele recebe ao importar o pacote sem atributos, então gerar e importar dão o mesmo jogador.
 * O sorteio vem só da identidade (nome, nascimento, nacionalidade, posição); sem nome o resultado é o mesmo para todos.
 */
export function suggestPlayerData(pkg: DataPackage, player: PackagePlayer): SuggestedData {
  const { clubById, leagueById } = indexPackage(pkg)
  const club = player.club ? clubById.get(player.club) : undefined
  const league = club ? leagueById.get(club.league) : undefined
  const tier = (league && league.level >= 1 && league.level <= 3 ? league.level : 1) as 1 | 2 | 3
  const economy = league ? leagueSetup(league).economy : undefined
  const bare: PackagePlayer = { name: player.name, birthDate: player.birthDate, nationality: player.nationality, position: player.position }
  const made = generateRealPlayer(bare, 'suggest', club?.id ?? null, { startYear: pkg.startYear ?? DEFAULT_START_YEAR, tier, club: club ? { id: club.id, reputation: club.reputation } : null, ...(economy ? { economy } : {}) })
  return {
    attributes: made.attributes,
    potential: made.hidden.potential,
    hidden: { consistency: made.hidden.consistency, injuryProneness: made.hidden.injuryProneness, professionalism: made.hidden.professionalism },
    contract: made.contract,
  }
}

const strengths = new WeakMap<PackagePlayer, { key: string; value: number }>()

/** Força geral na posição principal (decimal): a dos atributos do jogador ou, sem eles, a que o jogo geraria. */
export function playerStrength(pkg: DataPackage, player: PackagePlayer): number {
  if (player.attributes) return overallForPosition(player.attributes, player.position)
  const { clubById, leagueById } = indexPackage(pkg)
  const club = player.club ? clubById.get(player.club) : undefined
  const key = `${club?.reputation ?? 0}|${club?.league ?? ''}|${leagueById.get(club?.league ?? '')?.level ?? 0}|${JSON.stringify(leagueById.get(club?.league ?? '')?.economy ?? null)}|${pkg.startYear ?? 0}`
  const cached = strengths.get(player)
  if (cached && cached.key === key) return cached.value
  const value = overallForPosition(suggestPlayerData(pkg, player).attributes, player.position)
  strengths.set(player, { key, value })
  return value
}

/** Posição mais comum de cada vaga de um elenco novo (24 jogadores). */
export const SQUAD_TEMPLATE: readonly Position[] = ['GK', 'GK', 'GK', 'RB', 'RB', 'LB', 'LB', 'CB', 'CB', 'CB', 'CB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'AM', 'RW', 'RW', 'LW', 'ST', 'ST', 'ST']
