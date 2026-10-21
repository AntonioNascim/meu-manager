/**
 * Última etapa das planilhas reais, a partir dos arquivos da pasta de saída (sem rede): aplica as correções guardadas (`correcoes.json`),
 * gera os atributos pela fama (`attributes.ts`), remonta o rascunho `pacote-real.json` com a validação do jogo e escreve as planilhas de
 * conferência (`conferencia/`: os 300 jogadores mais fortes e a força dos clubes). Roda no fim do `dados:planilhas`, depois do
 * `dados:aplicar` e sozinha (`dados:finalizar`); como parte só de arquivos e é determinística, rodar de novo dá o mesmo resultado.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toCsv } from '../../src/data/package/edit/csv'
import { overallForPosition } from '../../src/engine/overall'
import { ageOn } from '../../src/engine/season/dates'
import { ATTRIBUTE_NAMES } from '../../src/engine/types'
import type { Attributes, Nationality, Position } from '../../src/engine/types'
import { blendFame, generateLeagueAttributes } from './attributes'
import type { GeneratedPlayer, Override, RosterClub, RosterPlayer } from './attributes'
import { loadCorrections, patchSheet, readSheet, writeSheet } from './corrections'
import type { Correction, Sheet } from './corrections'
import { REAL_LEAGUES } from './leagues'
import { buildRealPackage } from './packageOut'
import type { PackageSheet } from './packageOut'

/** Fama dos jogadores e a data da coleta (o ano dela fixa a idade usada nos atributos, para não mudarem de uma rodada para outra). */
export interface FameFile {
  date: string
  fame: Record<string, number>
  /** Visualizações da página nos últimos 3 meses (`pageviews.ts`), por id; só de quem teve a página consultada. */
  views?: Record<string, number>
}

export const FAME_FILE = 'fama.json'
export const CHECK_DIR = 'conferencia'
export const TOP_PLAYERS = 300
/** Quantos jogadores contam na força de um clube: os 14 melhores (a mesma conta do jogo). */
export const CLUB_STRENGTH_PLAYERS = 14

export function loadFame(dir: string): FameFile {
  const file = join(dir, FAME_FILE)
  if (!existsSync(file)) return { date: new Date().toISOString().slice(0, 10), fame: {} }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<FameFile>
  return { date: parsed.date ?? new Date().toISOString().slice(0, 10), fame: parsed.fame ?? {}, ...(parsed.views ? { views: parsed.views } : {}) }
}

export function saveFame(dir: string, file: FameFile): void {
  writeFileSync(join(dir, FAME_FILE), JSON.stringify(file))
}

export interface RankedPlayer {
  rank: number
  id: string
  name: string
  league: string
  club: string
  position: Position
  age: number
  overall: number
  potential: number
  fame: number
  /** Visualizações da página nos últimos 3 meses (vazio = não consultada). */
  views: number | undefined
  /** A força vem de uma correção à mão. */
  corrected: boolean
}

export interface RankedClub {
  rank: number
  id: string
  name: string
  league: string
  strength: number
  best: string
  bestOverall: number
  reputation: number
}

export interface FinalizeResult {
  leagues: string[]
  players: number
  validation: { errors: number; warnings: number; byCode: Record<string, number>; rejected: number }
  topPlayers: RankedPlayer[]
  topClubs: RankedClub[]
  /** Quantos jogadores do elenco principal têm força acima de cada marca. */
  distribution: { threshold: number; count: number }[]
  /** Por liga: média dos 11 mais fortes de cada clube, do melhor ao pior clube. */
  leagueStrength: { league: string; top: number; median: number; bottom: number }[]
  /** Correções guardadas que não acharam o registro nas planilhas (saiu do elenco?). */
  orphans: Correction[]
  /** Ajuste das visualizações recentes à fama de carreira (regressão), quando há visualizações. */
  viewsFit?: { intercept: number; slope: number; n: number; r: number }
}

const num = (text: string | undefined): number => Number(text ?? 0)

function overridesOf(items: readonly Correction[]): Map<string, Override> {
  const out = new Map<string, Override>()
  for (const c of items) {
    if (c.field !== 'overall' && c.field !== 'potential') continue
    const entry = out.get(c.id) ?? {}
    entry[c.field] = Number(c.value)
    out.set(c.id, entry)
  }
  return out
}

function attributesOfRow(row: Record<string, string>): Attributes {
  return Object.fromEntries(ATTRIBUTE_NAMES.map((a) => [a, num(row[a])])) as Attributes
}

function writeGenerated(row: Record<string, string>, made: GeneratedPlayer): void {
  for (const a of ATTRIBUTE_NAMES) row[a] = String(made.attributes[a])
  row.potential = String(made.potential)
  row.consistency = String(made.hidden.consistency)
  row.injuryProneness = String(made.hidden.injuryProneness)
  row.professionalism = String(made.hidden.professionalism)
}

export function finalizeOutput(dir: string, log: (message: string) => void = () => {}): FinalizeResult {
  const corrections = loadCorrections(dir)
  const overrides = overridesOf(corrections)
  const { date, fame: careerFame, views } = loadFame(dir)
  const blended = blendFame(careerFame, views)
  const fame = blended.fame
  const startYear = Number(date.slice(0, 4))
  const packageSheets: PackageSheet[] = []
  const ranked: RankedPlayer[] = []
  const clubs: RankedClub[] = []
  const seen = new Set<string>()
  const leagues: string[] = []
  const leagueStrength: FinalizeResult['leagueStrength'] = []
  let players = 0

  for (const league of REAL_LEAGUES) {
    const files = { clubs: join(dir, `${league.id}-clubes.csv`), players: join(dir, `${league.id}-jogadores.csv`), academy: join(dir, `${league.id}-base.csv`) }
    if (!existsSync(files.clubs) || !existsSync(files.players)) continue
    leagues.push(league.id)
    const clubSheet = readSheet(readFileSync(files.clubs, 'utf8'))
    const playerSheet = readSheet(readFileSync(files.players, 'utf8'))
    const academySheet: Sheet = existsSync(files.academy) ? readSheet(readFileSync(files.academy, 'utf8')) : { header: playerSheet.header, rows: [] }
    for (const sheet of [clubSheet, playerSheet, academySheet]) patchSheet(sheet, corrections)
    for (const sheet of [clubSheet, playerSheet, academySheet]) for (const row of sheet.rows) seen.add(row.id ?? '')

    const roster: RosterPlayer[] = [
      ...playerSheet.rows.map((r) => ({ id: r.id as string, name: r.name as string, birthDate: r.birthDate as string, nationality: r.nationality as Nationality, position: r.position as Position, clubId: r.club ? (r.club as string) : null, academy: false })),
      ...academySheet.rows.map((r) => ({ id: r.id as string, name: r.name as string, birthDate: r.birthDate as string, nationality: r.nationality as Nationality, position: r.position as Position, clubId: r.club ? (r.club as string) : null, academy: true })),
    ]
    const rosterClubs: RosterClub[] = clubSheet.rows.map((r) => ({ id: r.id as string, reputation: num(r.reputation) }))
    const made = generateLeagueAttributes({ id: league.id, tier: league.spec.tier as 1 | 2 | 3, ...(league.spec.economy ? { economy: league.spec.economy } : {}), repBottom: league.spec.repBottom }, rosterClubs, roster, { startYear, fame, overrides })
    for (const row of [...playerSheet.rows, ...academySheet.rows]) writeGenerated(row, made.get(row.id as string) as GeneratedPlayer)
    writeFileSync(files.clubs, writeSheet(clubSheet))
    writeFileSync(files.players, writeSheet(playerSheet))
    if (existsSync(files.academy)) writeFileSync(files.academy, writeSheet(academySheet))
    players += playerSheet.rows.length

    // Classificações: jogadores reais com clube e força de cada clube.
    const clubName = new Map(clubSheet.rows.map((r) => [r.id as string, r.name as string]))
    const byClub = new Map<string, { name: string; overall: number }[]>()
    for (const row of playerSheet.rows) {
      const overall = overallForPosition(attributesOfRow(row), row.position as Position)
      const generated = /^(sim|s|1|true)$/i.test(row.generated ?? '')
      if (row.club) (byClub.get(row.club) ?? byClub.set(row.club, []).get(row.club) ?? []).push({ name: row.name as string, overall })
      if (generated) continue
      ranked.push({ rank: 0, id: row.id as string, name: row.name as string, league: league.id, club: row.club ? (clubName.get(row.club) ?? '') : '(livre)', position: row.position as Position, age: ageOn(row.birthDate as string, `${startYear}-01-01`), overall, potential: num(row.potential), fame: careerFame[row.id as string] ?? 0, views: views?.[row.id as string], corrected: overrides.get(row.id as string)?.overall !== undefined })
    }
    const strengths: number[] = []
    for (const club of clubSheet.rows) {
      const list = (byClub.get(club.id as string) ?? []).sort((a, b) => b.overall - a.overall)
      const top = list.slice(0, CLUB_STRENGTH_PLAYERS)
      if (top.length === 0) continue
      const eleven = list.slice(0, 11)
      strengths.push(eleven.reduce((s, p) => s + p.overall, 0) / eleven.length)
      clubs.push({ rank: 0, id: club.id as string, name: club.name as string, league: league.id, strength: top.reduce((s, p) => s + p.overall, 0) / top.length, best: (list[0] as { name: string }).name, bestOverall: (list[0] as { overall: number }).overall, reputation: num(club.reputation) })
    }
    strengths.sort((a, b) => b - a)
    if (strengths.length > 0) leagueStrength.push({ league: league.id, top: strengths[0] as number, median: strengths[Math.floor(strengths.length / 2)] as number, bottom: strengths[strengths.length - 1] as number })

    packageSheets.push({ leagueId: league.id, stats: { clubs: clubSheet.rows.length }, clubsCsv: writeSheet(clubSheet), playersCsv: writeSheet(playerSheet), academyCsv: writeSheet(academySheet) })
  }

  ranked.sort((a, b) => b.overall - a.overall || b.fame - a.fame || a.id.localeCompare(b.id))
  ranked.forEach((p, i) => (p.rank = i + 1))
  clubs.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
  clubs.forEach((c, i) => (c.rank = i + 1))

  const creditsFile = join(dir, 'creditos.txt')
  const built = buildRealPackage(packageSheets, existsSync(creditsFile) ? readFileSync(creditsFile, 'utf8').trim() : '', startYear)
  writeFileSync(join(dir, 'pacote-real.json'), JSON.stringify(built.pkg))

  const topPlayers = ranked.slice(0, TOP_PLAYERS)
  writeCheckSheets(dir, topPlayers, clubs, overrides)
  const distribution = [90, 85, 80, 75, 70, 65, 60].map((threshold) => ({ threshold, count: ranked.filter((p) => p.overall >= threshold && p.club !== '(livre)').length }))
  log(`${leagues.length} ligas finalizadas; ${players} jogadores; validação: ${built.errors} erros`)
  return {
    leagues,
    players,
    validation: { errors: built.errors, warnings: built.warnings, byCode: built.byCode, rejected: built.rejected },
    topPlayers,
    topClubs: clubs.slice(0, 10),
    distribution,
    leagueStrength,
    orphans: corrections.filter((c) => !seen.has(c.id)),
    ...(blended.fit ? { viewsFit: blended.fit } : {}),
  }
}

const POSITION_NAME: Record<Position, string> = { GK: 'Goleiro', RB: 'Lateral direito', LB: 'Lateral esquerdo', CB: 'Zagueiro', DM: 'Volante', CM: 'Meia', AM: 'Meia ofensivo', RW: 'Ponta direito', LW: 'Ponta esquerdo', ST: 'Atacante' }

/** Planilhas de conferência. A dos jogadores usa as colunas das tarefas (`força` em `campo`), então volta pelo mesmo `dados:aplicar`. */
function writeCheckSheets(dir: string, top: readonly RankedPlayer[], clubs: readonly RankedClub[], overrides: ReadonlyMap<string, Override>): void {
  mkdirSync(join(dir, CHECK_DIR), { recursive: true })
  const rows = top.map((p) => {
    const fixed = overrides.get(p.id)?.overall
    return [p.rank, 'Força', p.league, p.club, p.name, p.id, POSITION_NAME[p.position], p.age, Math.round(p.potential), p.fame, p.views ?? '', 'força', `nº ${p.rank} do mundo; força geral na posição (1 a 100). Craque do mundo: 85 ou mais`, Math.round(p.overall), fixed !== undefined ? fixed : '', 'Conferir pelo desempenho, prêmios e a fama do jogador; só preencher se achar a força errada', fixed !== undefined ? 'sim' : '']
  })
  writeFileSync(join(dir, CHECK_DIR, 'top-300-jogadores.csv'), toCsv(['ranking', 'tipo', 'liga', 'clube', 'jogador', 'id', 'posicao', 'idade', 'potencial', 'fama', 'visualizacoes_3_meses', 'campo', 'situacao', 'valor_provisorio', 'valor_correto', 'onde_procurar', 'feito'], rows))
  writeFileSync(join(dir, CHECK_DIR, 'forca-dos-clubes.csv'), toCsv(['ranking', 'liga', 'clube', 'forca_14_melhores', 'melhor_jogador', 'forca_do_melhor', 'reputacao'], clubs.map((c) => [c.rank, c.league, c.name, c.strength.toFixed(1), c.best, Math.round(c.bestOverall), c.reputation])))
}

export function distributionMarkdown(result: FinalizeResult): string {
  const lines = ['# Distribuição de força do mundo real (jogadores com clube)', '', '| Força geral | Jogadores |', '|---:|---:|']
  for (const d of result.distribution) lines.push(`| ${d.threshold} ou mais | ${d.count} |`)
  lines.push('', '## Os 11 mais fortes de cada clube, por liga (média)', '', '| Liga | Melhor clube | Clube do meio | Pior clube |', '|---|---:|---:|---:|')
  for (const l of result.leagueStrength) lines.push(`| ${l.league} | ${l.top.toFixed(1)} | ${l.median.toFixed(1)} | ${l.bottom.toFixed(1)} |`)
  return `${lines.join('\n')}\n`
}

/** Texto para o terminal: distribuição, os melhores jogadores e os melhores clubes. */
export function summaryText(result: FinalizeResult, players = 20, clubs = 10): string {
  const pad = (text: string | number, n: number): string => String(text).padEnd(n)
  const lines = ['', 'Distribuição de força (jogadores com clube): ' + result.distribution.map((d) => `${d.threshold}+: ${d.count}`).join(' · '), '', `Top ${players} jogadores`]
  for (const p of result.topPlayers.slice(0, players)) lines.push(`  ${pad(p.rank, 3)} ${pad(p.name, 28)} ${pad(p.club, 24)} ${pad(p.league, 5)} ${pad(p.position, 3)} ${p.age} anos  força ${p.overall.toFixed(1)}  pot ${p.potential}  fama ${p.fame}  visualizações ${p.views ?? '—'}`)
  lines.push('', `Top ${clubs} clubes (média dos ${CLUB_STRENGTH_PLAYERS} melhores)`)
  for (const c of result.topClubs.slice(0, clubs)) lines.push(`  ${pad(c.rank, 3)} ${pad(c.name, 28)} ${pad(c.league, 5)} força ${c.strength.toFixed(1)}  melhor: ${c.best} (${Math.round(c.bestOverall)})`)
  if (result.viewsFit) lines.push('', `Visualizações recentes × fama de carreira: ${result.viewsFit.n} jogadores, correlação ${result.viewsFit.r.toFixed(2)} (a fama de agora mistura as duas)`)
  const v = result.validation
  lines.push('', `Validação do pacote-real.json: ${v.errors} erros, ${v.warnings} avisos, ${v.rejected} linhas recusadas`)
  if (result.orphans.length > 0) lines.push(`Atenção: ${result.orphans.length} correções guardadas não acharam o registro nas planilhas (o jogador saiu do elenco?): ${result.orphans.slice(0, 5).map((c) => `${c.player ?? c.club ?? c.id} (${c.field})`).join(', ')}${result.orphans.length > 5 ? '…' : ''}`)
  return lines.join('\n')
}
