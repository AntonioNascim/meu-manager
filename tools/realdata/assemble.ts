/**
 * Monta as linhas das planilhas (clubes e jogadores de uma liga) a partir do que as fontes devolveram, e junta o que ficou faltando ou
 * duvidoso. Funções puras: a rede fica em `wikipedia.ts` e `wikidata.ts`. As colunas e a ordem são as do editor (`csv.ts` do jogo).
 */
import { CLUB_COLUMNS, PLAYER_COLUMNS, toCsv } from '../../src/data/package/edit/csv'
import type { Foot, Nationality, Position } from '../../src/engine/types'
import { isUnitedKingdom, toNationality } from './nationality'
import { guessPositions, parseCoarse } from './positions'
import type { RealLeague } from './leagues'
import type { ClubInfo, PlayerInfo } from './wikidata'
import type { SquadEntry } from './wikitext'

export type IssueKind =
  | 'club-count'
  | 'club-missing-season'
  | 'club-no-colors'
  | 'club-no-stadium'
  | 'club-no-capacity'
  | 'club-bad-capacity'
  | 'club-no-city'
  | 'squad-missing'
  | 'squad-small'
  | 'squad-large'
  | 'player-no-birthdate'
  | 'player-birth-imprecise'
  | 'player-position'
  | 'player-nationality'
  | 'player-no-wikidata'
  | 'player-duplicate'

export interface Issue {
  league: string
  kind: IssueKind
  club?: string
  player?: string
  /** Id do registro na planilha. */
  id?: string
  detail: string
}

export interface ClubSource {
  info: ClubInfo
  /** Nome como a lista da temporada escreve (curto: "Flamengo"); vale mais que o rótulo oficial do Wikidata. */
  displayName?: string
  /** Artigo do clube usado para o elenco (créditos). */
  articleTitle?: string
}

export interface SquadSource {
  entries: SquadEntry[]
  /** Seção do artigo de onde saiu. */
  section?: string
}

export interface LeagueInput {
  league: RealLeague
  clubs: ClubSource[]
  squads: Map<string, SquadSource>
  /** Dados do Wikidata por item de jogador. */
  players: Map<string, PlayerInfo>
  /** Artigo → item do Wikidata, dos jogadores da tabela. */
  articleToQid: Map<string, string>
  /** Avisos da busca dos clubes (temporada não achada, contagem...). */
  notes?: Issue[]
}

export interface SheetStats {
  clubs: number
  expected: number
  players: number
  smallest: number
  largest: number
  noBirthdate: number
  reviewPositions: number
}

export interface LeagueSheets {
  leagueId: string
  clubsCsv: string
  playersCsv: string
  issues: Issue[]
  stats: SheetStats
}

/** Estado compartilhado entre as ligas: siglas e ids não podem se repetir no pacote inteiro. */
export interface AssembleState {
  abbreviations: Set<string>
  playerIds: Set<string>
}

export const newAssembleState = (): AssembleState => ({ abbreviations: new Set(), playerIds: new Set() })

const strip = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '')
const letters = (text: string): string => strip(text).toUpperCase().replace(/[^A-Z]/g, '')
const same = (a: string, b: string): boolean => strip(a).toLowerCase().replace(/[^a-z0-9]/g, '') === strip(b).toLowerCase().replace(/[^a-z0-9]/g, '')

const STOP_WORDS = new Set(['fc', 'cf', 'sc', 'ec', 'ac', 'as', 'sd', 'cd', 'ud', 'ca', 'fk', 'sv', 'vfl', 'vfb', 'club', 'clube', 'de', 'da', 'do', 'dos', 'das', 'del', 'la', 'las', 'los', 'el', 'the', 'of', 'and', 'e', 'y', 'football', 'futebol', 'sporting', 'esporte', 'atletico', 'athletic', 'associacao'])

/** Sigla de 3 letras que não repete: a do Wikidata se couber, senão derivada do nome. */
export function pickAbbreviation(name: string, shortNames: readonly string[], taken: Set<string>): string {
  const candidates: string[] = []
  for (const short of shortNames) if (/^[A-Za-z]{3}$/.test(short)) candidates.push(short.toUpperCase())
  const words = strip(name).split(/[^A-Za-z]+/).filter(Boolean)
  const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
  const base = (significant.length > 0 ? significant : words).map((w) => w.toUpperCase())
  const first = base[0] ?? ''
  const second = base[1] ?? ''
  const third = base[2] ?? ''
  candidates.push(first.slice(0, 3), (first[0] ?? '') + second.slice(0, 2), (first[0] ?? '') + (second[0] ?? '') + (third[0] ?? ''), first.slice(0, 2) + (second[0] ?? ''), (first[0] ?? '') + (first.at(-1) ?? '') + (second[0] ?? ''))
  // Última saída: qualquer combinação de letras do nome, na ordem em que aparecem.
  const all = letters(name)
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) for (let k = j + 1; k < all.length; k++) candidates.push((all[i] as string) + (all[j] as string) + (all[k] as string))
  for (const candidate of candidates) {
    if (/^[A-Z]{3}$/.test(candidate) && !taken.has(candidate)) return (taken.add(candidate), candidate)
  }
  for (let n = 0; n < 26 ** 3; n++) {
    const candidate = String.fromCharCode(65 + (n % 26), 65 + (Math.floor(n / 26) % 26), 65 + Math.floor(n / 676))
    if (!taken.has(candidate)) return (taken.add(candidate), candidate)
  }
  throw new Error('Siglas esgotadas')
}

/** Duas cores do clube: primeiro as de matiz forte, depois preto e branco (o Wikidata não ordena as cores). */
export function pickColors(colors: readonly string[]): string[] {
  const weight = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max
    if (saturation > 0.2 && max > 0.15) return 2 + saturation
    return max < 0.5 ? 1 : 0
  }
  return [...colors].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b)).slice(0, 2)
}

/** Reputação provisória (1 a 20) pela fama do clube: a mesma escada de reputação da liga no mundo fictício. */
export function provisionalReputation(rank: number, count: number, league: RealLeague): number {
  const { repTop, repBottom, repCurve } = league.spec
  if (count <= 1) return repTop
  const value = repBottom + (repTop - repBottom) * (1 - rank / (count - 1)) ** (repCurve ?? 1)
  return Math.min(20, Math.max(1, Math.round(value)))
}

export const clubId = (qid: string): string => `wd-${qid}`

/** Id estável do jogador: o item do Wikidata, ou o clube e o nome quando a tabela não tem link. */
export function playerId(qid: string | undefined, clubQid: string, name: string): string {
  if (qid) return `wd-${qid}`
  return `wp-${clubQid}-${letters(name).toLowerCase()}`
}

const FOOT: Record<string, Foot> = { right: 'right', left: 'left', both: 'both' }

export function assembleLeague(input: LeagueInput, state: AssembleState): LeagueSheets {
  const { league } = input
  const issues: Issue[] = [...(input.notes ?? [])]
  const issue = (kind: IssueKind, detail: string, extra: Partial<Issue> = {}): void => void issues.push({ league: league.id, kind, detail, ...extra })

  const ranked = [...input.clubs].sort((a, b) => b.info.sitelinks - a.info.sitelinks || a.info.name.localeCompare(b.info.name))
  const rankOf = new Map(ranked.map((c, i) => [c.info.qid, i]))
  if (input.clubs.length !== league.expected) issue('club-count', `${input.clubs.length} clubes encontrados; a liga tem ${league.expected} no jogo`)

  const clubRows: (string | number | undefined)[][] = []
  const playerRows: (string | number | undefined)[][] = []
  let smallest = Infinity
  let largest = 0
  let noBirthdate = 0
  let reviewPositions = 0
  let players = 0

  for (const source of [...input.clubs].sort((a, b) => a.info.name.localeCompare(b.info.name))) {
    const { info } = source
    const name = source.displayName ?? info.name
    const id = clubId(info.qid)
    const abbreviation = pickAbbreviation(name, info.shortNames, state.abbreviations)
    const colors = pickColors(info.colors)
    if (colors.length === 0) issue('club-no-colors', 'sem cores no Wikidata (o jogo usa vermelho e branco)', { club: name, id })
    else if (colors.length === 1) issue('club-no-colors', `só uma cor no Wikidata (${colors[0]}); a segunda fica branca`, { club: name, id })
    if (!info.venue) issue('club-no-stadium', 'sem estádio no Wikidata', { club: name, id })
    let capacity = info.capacity
    if (info.venue && capacity === undefined) issue('club-no-capacity', 'sem capacidade do estádio (o jogo usa 20.000)', { club: name, id })
    if (capacity !== undefined && (capacity < 500 || capacity > 300_000)) {
      issue('club-bad-capacity', `capacidade ${capacity} fora de 500 a 300.000; deixada em branco`, { club: name, id })
      capacity = undefined
    }
    if (!info.city) issue('club-no-city', 'sem cidade no Wikidata', { club: name, id })
    clubRows.push([id, name, abbreviation, colors[0], colors[1], info.city, '', info.venue, capacity, provisionalReputation(rankOf.get(info.qid) ?? 0, input.clubs.length, league), league.id, league.spec.name])

    const squad = input.squads.get(info.qid)
    if (!squad || squad.entries.length === 0) {
      issue('squad-missing', 'nenhum elenco encontrado na Wikipedia', { club: name, id })
      smallest = 0
      continue
    }
    let kept = 0
    for (const entry of squad.entries) {
      const articleQid = entry.title ? input.articleToQid.get(entry.title) : undefined
      const wd = articleQid ? input.players.get(articleQid) : undefined
      const pid = playerId(articleQid, info.qid, entry.display)
      const label = wd?.name ?? entry.display
      if (state.playerIds.has(pid)) {
        issue('player-duplicate', 'já está no elenco de outro clube (emprestado?); mantido o primeiro', { club: name, player: label, id: pid })
        continue
      }
      state.playerIds.add(pid)
      kept++
      if (!articleQid) issue('player-no-wikidata', 'sem artigo na Wikipedia; só nome, país e setor da tabela do clube', { club: name, player: label, id: pid })

      const foot = wd?.foot ? FOOT[wd.foot] : undefined
      const guess = guessPositions(wd?.positions ?? [], parseCoarse(entry.pos), foot)
      if (guess.review.length > 0) {
        reviewPositions++
        issue('player-position', `${guess.review.join('; ')} → ${guess.primary}`, { club: name, player: label, id: pid })
      }

      let nationality: Nationality | undefined = toNationality(entry.nat)
      if (!nationality) {
        const fromWikidata = (wd?.nationalities ?? []).map((n) => ({ n, mapped: toNationality(n) }))
        nationality = fromWikidata.find((x) => x.mapped)?.mapped
        if (!nationality && fromWikidata.some((x) => isUnitedKingdom(x.n))) {
          nationality = 'England'
          issue('player-nationality', 'o Wikidata diz Reino Unido; usada a Inglaterra', { club: name, player: label, id: pid })
        }
      }
      if (!nationality) {
        nationality = league.country
        issue('player-nationality', `país não encontrado (${entry.nat ?? wd?.nationalities.join('/') ?? 'sem dado'}); usado o da liga`, { club: name, player: label, id: pid })
      }

      if (!wd?.birthDate) {
        noBirthdate++
        issue(wd?.birthYear ? 'player-birth-imprecise' : 'player-no-birthdate', wd?.birthYear ? `só o ano de nascimento (${wd.birthYear}); data em branco` : 'sem data de nascimento; data em branco', { club: name, player: label, id: pid })
      }

      const nickname = wd?.name && entry.display.length < wd.name.length && !same(entry.display, wd.name) ? entry.display : wd?.nickname
      const row: Record<string, string | number | undefined> = {
        id: pid,
        name: label,
        nickname,
        birthDate: wd?.birthDate,
        nationality,
        position: guess.primary as Position,
        secondaryPositions: guess.secondary.join('|'),
        foot,
        club: id,
        clubName: name,
      }
      playerRows.push(PLAYER_COLUMNS.map((column) => row[column]))
    }
    players += kept
    smallest = Math.min(smallest, kept)
    largest = Math.max(largest, kept)
    if (kept < 18) issue('squad-small', `${kept} jogadores (o pacote exige de 18 a 30)`, { club: name, id })
    if (kept > 30) issue('squad-large', `${kept} jogadores (o pacote aceita no máximo 30)`, { club: name, id })
  }

  return {
    leagueId: league.id,
    clubsCsv: toCsv(CLUB_COLUMNS, clubRows),
    playersCsv: toCsv(PLAYER_COLUMNS, playerRows),
    issues,
    stats: { clubs: input.clubs.length, expected: league.expected, players, smallest: Number.isFinite(smallest) ? smallest : 0, largest, noBirthdate, reviewPositions },
  }
}
