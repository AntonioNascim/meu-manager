/**
 * Rascunho do pacote real a partir das planilhas: as ligas com o número real de clubes de cada uma (e o formato: turno único onde for o
 * caso), os clubes e os jogadores. Serve para abrir no editor e ver a validação inteira (elenco de 18 a 30, goleiro...), e como medida do
 * que ainda falta. Nomes de campeonato genéricos (o nome oficial é marca).
 */
import { parseClubsCsv, parsePlayersCsv } from '../../src/data/package/edit/csv'
import { PACKAGE_FORMAT, PACKAGE_VERSION } from '../../src/data/package/types'
import type { DataPackage, PackageClub, PackageLeague, PackagePlayer } from '../../src/data/package/types'
import { validatePackage } from '../../src/data/package/validate'
import { COUNTRY_NAME, FOREIGN_LIMITS } from '../../src/diagnostics/scalePackage'
import type { LeagueSheets } from './assemble'
import { REAL_LEAGUES } from './leagues'

/** Ligas do pacote, com `teams` igual ao número de clubes achados em cada uma. */
export function leagueDefinitions(sheets: readonly LeagueSheets[]): PackageLeague[] {
  const found = new Map(sheets.map((s) => [s.leagueId, s.stats.clubs]))
  return REAL_LEAGUES.filter((l) => found.has(l.id)).map((league) => {
    const sameCountry = REAL_LEAGUES.filter((l) => l.id.startsWith(league.id.split('-')[0] as string))
    const lowest = Math.max(...sameCountry.map((l) => l.spec.tier))
    const isBrazil = league.country === 'Brazil'
    const brazilic = isBrazil ? { promotion: league.spec.tier === 1 ? 0 : 4, relegation: league.spec.tier === lowest ? 0 : 4 } : { promotion: 0, relegation: 0 }
    return {
      id: league.id,
      name: isBrazil ? league.spec.name.replace('Brasil ', 'Série ') : (league.spec.leagueName ?? `Liga ${COUNTRY_NAME[league.country] ?? league.country}`),
      country: league.country,
      level: league.spec.tier,
      teams: found.get(league.id) as number,
      ...brazilic,
      ...(league.spec.format === 'single' ? { rounds: 1 as const } : {}),
      ...(FOREIGN_LIMITS[league.id] ? { foreignLimit: FOREIGN_LIMITS[league.id] } : {}),
    }
  })
}

export interface BuiltPackage {
  pkg: DataPackage
  /** Linhas das planilhas que o leitor do editor recusou. */
  rejected: number
  errors: number
  warnings: number
  /** Erros por código, para o relatório. */
  byCode: Record<string, number>
}

export function buildRealPackage(sheets: readonly LeagueSheets[], credits: string, startYear: number): BuiltPackage {
  const leagues = leagueDefinitions(sheets)
  const skeleton = { leagues, clubs: [], players: [] } as unknown as DataPackage
  const clubs: PackageClub[] = []
  let rejected = 0
  for (const sheet of sheets) {
    const parsed = parseClubsCsv(sheet.clubsCsv, skeleton)
    rejected += parsed.total - parsed.rows.length
    clubs.push(...parsed.rows.map((r) => r.value))
  }
  const withClubs = { ...skeleton, clubs } as unknown as DataPackage
  const players: PackagePlayer[] = []
  for (const sheet of sheets) {
    const parsed = parsePlayersCsv(sheet.playersCsv, withClubs)
    rejected += parsed.total - parsed.rows.length
    players.push(...parsed.rows.map((r) => r.value))
  }
  const countries = [...new Set(leagues.map((l) => l.country))].map((id) => ({ id: id as never, name: COUNTRY_NAME[id as never] ?? id }))
  const pkg = { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, name: 'Mundo real (rascunho das planilhas)', startYear, credits, countries, leagues, clubs, players } as unknown as DataPackage
  const { report } = validatePackage(pkg, { maxIssues: 100_000 })
  const byCode: Record<string, number> = {}
  for (const issue of report.errors) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1
  return { pkg, rejected, errors: report.errors.length + (report.more ?? 0), warnings: report.warnings.length, byCode }
}
