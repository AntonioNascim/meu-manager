/**
 * Monta as linhas das planilhas (clubes e jogadores de uma liga) a partir do que as fontes devolveram, e junta o que ficou faltando ou
 * duvidoso. Funções puras: a rede fica em `wikipedia.ts` e `wikidata.ts`. As colunas e a ordem são as do editor (`csv.ts` do jogo).
 */
import { CLUB_COLUMNS, PLAYER_COLUMNS, toCsv } from '../../src/data/package/edit/csv'
import type { Foot, Nationality, Position } from '../../src/engine/types'
import { isUnitedKingdom, toNationality } from './nationality'
import { guessPositions, parseCoarse } from './positions'
import type { PositionGuess } from './positions'
import { distributePositions, missingPositions, trimSquad } from './squadPlan'
import { makePlayer } from '../../src/data/package/edit/ops'
import { createRng } from '../../src/engine/rng'
import type { DataPackage } from '../../src/data/package/types'
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
  | 'player-not-person'
  | 'player-to-academy'
  | 'player-freed'
  | 'player-generated'
  | 'squad-generated'

export interface Issue {
  league: string
  kind: IssueKind
  club?: string
  player?: string
  /** Id do registro na planilha. */
  id?: string
  detail: string
  /** Campo a corrigir à mão (estádio, cidade, cores, posição...) e o valor provisório que ficou na planilha. */
  field?: string
  current?: string
  /** Quanto o jogador é conhecido (páginas do Wikidata em outras línguas): ordena as tarefas de posição. */
  fame?: number
  /** Resolvida por uma correção guardada (`correcoes.json`): sai da lista de tarefas. */
  resolved?: boolean
}

export interface ClubSource {
  info: ClubInfo
  /** Nome como a lista da temporada escreve (curto: "Flamengo"); vale mais que o rótulo oficial do Wikidata. */
  displayName?: string
  /** Artigo do clube usado para o elenco (créditos). */
  articleTitle?: string
  /** Cores do uniforme principal no quadro do clube na Wikipedia em inglês. */
  kit?: string[]
  /** Texto do estádio no quadro do clube ("Estádio, Cidade"). */
  ground?: string
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
  /** Data de referência das idades (padrão: hoje). */
  today?: Date
  /** Avisos da busca dos clubes (temporada não achada, contagem...). */
  notes?: Issue[]
}

export interface SheetStats {
  clubs: number
  expected: number
  players: number
  smallest: number
  largest: number
  estimated: number
  /** Posições a revisar (só jogadores com artigo na Wikipedia). */
  reviewPositions: number
  /** Jogadores com a posição distribuída pela necessidade do elenco. */
  distributed: number
  toAcademy: number
  freed: number
  generated: number
  /** Clubes que ganharam cores do desenho do uniforme. */
  colorsFromKit: number
}

export interface LeagueSheets {
  leagueId: string
  clubsCsv: string
  playersCsv: string
  /** Base dos clubes (jovens que passaram do limite do elenco). */
  academyCsv: string
  issues: Issue[]
  stats: SheetStats
  /** Fama de cada jogador (páginas do Wikidata em outras línguas), por id: o sinal de qualidade dos atributos (`attributes.ts`). Gerados não entram. */
  fame: Record<string, number>
}

/** Estado compartilhado entre as ligas: siglas e ids não podem se repetir no pacote inteiro. */
export interface AssembleState {
  abbreviations: Set<string>
  playerIds: Set<string>
}

interface Draft {
  row: Record<string, string | number | undefined>
  club: string
  clubQid: string
  clubName: string
  guess: PositionGuess
  /** Tem artigo na Wikipedia (jogador mais conhecido). */
  article: boolean
  fame: number
  foot?: Foot
  player: string
  id: string
  /** Data completa vinda das fontes. */
  known?: string
  /** Só o ano de nascimento. */
  year?: number
}

/** Chave do artigo do jogador no mapa artigo → item do Wikidata (os da Wikipedia local levam a língua na frente). */
export const articleKey = (entry: { title?: string; lang?: string }): string => (entry.lang && entry.lang !== 'en' ? `${entry.lang}:${entry.title ?? ''}` : (entry.title ?? ''))

function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Idade em anos (decimal) de quem nasceu em `birth` (AAAA-MM-DD) na data `on`. */
function ageOn(birth: string, on: Date): number {
  return (on.getTime() - new Date(`${birth}T12:00:00Z`).getTime()) / (365.25 * 24 * 3600 * 1000)
}

/** Item do Wikidata sem nascimento, país, posição nem pé: não parece uma pessoa. */
const hasNoPersonData = (wd: PlayerInfo): boolean => !wd.birthDate && wd.birthYear === undefined && wd.nationalities.length === 0 && wd.positions.length === 0 && !wd.foot
/** Páginas a partir das quais um item sem dados de pessoa é descartado (jogador de verdade sem nenhum dado quase não tem páginas em outras línguas). */
const NOT_PERSON_SITELINKS = 12
/** Itens sem dados de pessoa num mesmo elenco a partir dos quais a tabela toda é descartada como patrocinadores ou cidades. */
const BOGUS_TABLE_ENTRIES = 8

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
  const today = input.today ?? new Date()

  const ranked = [...input.clubs].sort((a, b) => b.info.sitelinks - a.info.sitelinks || a.info.name.localeCompare(b.info.name))
  const rankOf = new Map(ranked.map((c, i) => [c.info.qid, i]))
  if (input.clubs.length !== league.expected) issue('club-count', `${input.clubs.length} clubes encontrados; o número real da liga é ${league.expected}`)

  const clubRows: (string | number | undefined)[][] = []
  const drafts: Draft[] = []
  const clubName = new Map<string, string>()
  let colorsFromKit = 0

  for (const source of [...input.clubs].sort((a, b) => a.info.name.localeCompare(b.info.name))) {
    const { info } = source
    const name = source.displayName ?? info.name
    const id = clubId(info.qid)
    clubName.set(id, name)
    const abbreviation = pickAbbreviation(name, info.shortNames, state.abbreviations)

    // Cores: as do Wikidata; as que faltam vêm do desenho da camisa no quadro do clube na Wikipedia em inglês.
    const fromWikidata = pickColors(info.colors)
    const colors = [...new Set([...fromWikidata, ...(source.kit ?? [])])].slice(0, 2)
    if (colors.length > fromWikidata.length) colorsFromKit++
    if (colors.length === 0) issue('club-no-colors', 'sem cores no Wikidata nem no quadro do uniforme (o jogo usa vermelho e branco)', { club: name, id, field: 'cores', current: '' })
    else if (colors.length === 1) issue('club-no-colors', `só uma cor achada (${colors[0]}); a segunda fica branca`, { club: name, id, field: 'cor 2', current: colors[0] as string })

    // Estádio e cidade: Wikidata; senão o texto do quadro do clube ("Estádio, Cidade"); senão um nome provisório (a validação exige os dois).
    const ground = (source.ground ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    let stadium = info.venue ?? ground[0]
    let city = info.city ?? (ground.length > 1 ? ground[ground.length - 1] : undefined)
    if (!stadium) {
      stadium = `Estádio ${name}`
      issue('club-no-stadium', 'estádio não encontrado; nome provisório', { club: name, id, field: 'estádio', current: stadium })
    }
    if (!city) {
      city = name
      issue('club-no-city', 'cidade não encontrada; usado o nome do clube como provisório', { club: name, id, field: 'cidade', current: city })
    }
    let capacity = info.capacity
    if (capacity === undefined) issue('club-no-capacity', 'sem capacidade do estádio (o jogo usa 20.000)', { club: name, id, field: 'capacidade', current: '' })
    else if (capacity < 500 || capacity > 300_000) {
      issue('club-bad-capacity', `capacidade ${capacity} fora de 500 a 300.000; deixada em branco`, { club: name, id, field: 'capacidade', current: String(capacity) })
      capacity = undefined
    }
    clubRows.push([id, name, abbreviation, colors[0], colors[1], city, '', stadium, capacity, provisionalReputation(rankOf.get(info.qid) ?? 0, input.clubs.length, league), league.id, league.spec.name])

    const squad = input.squads.get(info.qid)
    if (!squad || squad.entries.length === 0) issue('squad-missing', 'nenhum elenco encontrado na Wikipedia', { club: name, id })
    const bogusTable = (squad?.entries ?? []).filter((e) => {
      const q = e.title ? input.articleToQid.get(articleKey(e)) : undefined
      const info = q ? input.players.get(q) : undefined
      return info !== undefined && hasNoPersonData(info)
    }).length >= BOGUS_TABLE_ENTRIES
    for (const entry of squad?.entries ?? []) {
      const articleQid = entry.title ? input.articleToQid.get(articleKey(entry)) : undefined
      const wd = articleQid ? input.players.get(articleQid) : undefined
      const pid = playerId(articleQid, info.qid, entry.display)
      const label = wd?.name ?? entry.display
      // Link da tabela que não leva a uma pessoa (patrocinador, cidade, clube): o item não tem nascimento, país, posição nem pé e é conhecido
      // demais para ser um jogador sem dados, ou a tabela inteira é de itens assim (uma lista de patrocinadores lida como elenco).
      if (wd && hasNoPersonData(wd) && ((wd.sitelinks ?? 0) >= NOT_PERSON_SITELINKS || bogusTable)) {
        issue('player-not-person', 'o link da tabela do elenco não leva a um jogador (patrocinador, cidade ou clube); descartado', { club: name, player: label, id: pid })
        continue
      }
      if (state.playerIds.has(pid)) {
        issue('player-duplicate', 'já está no elenco de outro clube (emprestado?); mantido o primeiro', { club: name, player: label, id: pid })
        continue
      }
      state.playerIds.add(pid)
      if (!articleQid) issue('player-no-wikidata', 'sem artigo na Wikipedia; só nome, país e setor da tabela do clube', { club: name, player: label, id: pid })

      const foot = wd?.foot ? FOOT[wd.foot] : undefined
      const guess = guessPositions(wd?.positions ?? [], parseCoarse(entry.pos), foot, entry.localPosition)

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
      drafts.push({ row, club: id, clubQid: info.qid, clubName: name, player: label, id: pid, guess, known: wd?.birthDate, ...(wd?.birthYear !== undefined ? { year: wd.birthYear } : {}), article: articleQid !== undefined, fame: wd?.sitelinks ?? 0, ...(foot ? { foot } : {}) })
    }
  }

  // Datas ausentes em todas as fontes: estimadas pela idade aproximada (só o ano) ou pela média de idade do elenco, e marcadas como estimadas.
  let estimated = 0
  const ages = new Map<string, number[]>()
  const leagueAges: number[] = []
  for (const d of drafts) {
    if (!d.known) continue
    const age = ageOn(d.known, today)
    ;(ages.get(d.club) ?? ages.set(d.club, []).get(d.club) ?? []).push(age)
    leagueAges.push(age)
  }
  const mean = (list: readonly number[]): number | undefined => (list.length >= 5 ? list.reduce((a, b) => a + b, 0) / list.length : undefined)
  const leagueMean = mean(leagueAges) ?? 26
  for (const d of drafts) {
    if (d.known) continue
    estimated++
    const hash = hashOf(d.id)
    let date: string
    if (d.year !== undefined) {
      date = `${d.year}-07-01`
      issue('player-birth-imprecise', `só o ano de nascimento (${d.year}); data estimada em ${date}`, { club: d.clubName, player: d.player, id: d.id })
    } else {
      const base = mean(ages.get(d.club) ?? []) ?? leagueMean
      const age = Math.max(17, Math.round(base) + (hash % 7) - 3)
      const year = today.getFullYear() - age
      date = `${year}-${String(1 + ((hash >>> 3) % 12)).padStart(2, '0')}-${String(1 + ((hash >>> 7) % 28)).padStart(2, '0')}`
      issue('player-no-birthdate', `sem data em nenhuma fonte; estimada pela média de idade do elenco (${base.toFixed(1)} anos): ${date}`, { club: d.clubName, player: d.player, id: d.id })
    }
    d.row.birthDate = date
    d.row.birthEstimated = 'sim'
  }

  // Por clube: posições, excesso de jogadores e elencos curtos.
  const main: Draft[] = []
  const academy: Draft[] = []
  const free: Draft[] = []
  const generated: Record<string, string | number | undefined>[] = []
  let distributed = 0
  let reviewPositions = 0
  const byClub = new Map<string, Draft[]>()
  for (const d of drafts) (byClub.get(d.club) ?? byClub.set(d.club, []).get(d.club) ?? []).push(d)
  const generationContext = { startYear: today.getFullYear() } as unknown as DataPackage
  let smallest = Infinity
  let largest = 0

  for (const source of [...input.clubs].sort((a, b) => a.info.name.localeCompare(b.info.name))) {
    const id = clubId(source.info.qid)
    const name = clubName.get(id) as string
    const list = byClub.get(id) ?? []

    // Posições genéricas distribuídas conforme a necessidade de um time real.
    const planned = distributePositions(list.map((d) => ({ position: d.guess.primary, generic: d.guess.review.length > 0, ...(d.foot ? { foot: d.foot } : {}) })))
    list.forEach((d, i) => {
      const position = planned[i] as Position
      d.row.position = position
      d.row.secondaryPositions = d.guess.secondary.filter((p) => p !== position && (p === 'GK') === (position === 'GK')).join('|')
      if (d.guess.review.length === 0) return
      distributed++
      // Só os jogadores com artigo na Wikipedia (os mais conhecidos) ficam marcados para revisão.
      if (d.article) {
        reviewPositions++
        issue('player-position', `${d.guess.review.join('; ')} → ${position} (distribuída pela necessidade do elenco)`, { club: name, player: d.player, id: d.id, field: 'posição', current: position, fame: d.fame })
      }
    })

    // Mais de 30: jovens para a base, o resto dos menos conhecidos para o mercado.
    const trimmed = trimSquad(list.map((d) => ({ position: d.row.position as Position, age: ageOn(d.row.birthDate as string, today), known: d.article })))
    for (const i of trimmed.academy) {
      const d = list[i] as Draft
      academy.push(d)
      issue('player-to-academy', `elenco com ${list.length} jogadores; passou para a base`, { club: name, player: d.player, id: d.id })
    }
    for (const i of trimmed.free) {
      const d = list[i] as Draft
      d.row.club = ''
      d.row.clubName = ''
      free.push(d)
      issue('player-freed', `elenco com ${list.length} jogadores; ficou livre no mercado`, { club: name, player: d.player, id: d.id })
    }
    const kept = trimmed.keep.map((i) => list[i] as Draft)
    main.push(...kept)

    // Menos de 18: completa com jogadores gerados, para trocar pelos reais depois.
    let size = kept.length
    if (size < 18) {
      const positions = missingPositions(kept.map((d) => d.row.position as Position), Math.max(20, 18))
      const rng = createRng(`gen:${source.info.qid}`)
      positions.forEach((position, n) => {
        const made = makePlayer(generationContext, rng, position, league.country, id, `gen-${source.info.qid}-${n + 1}`)
        generated.push({ id: made.id, name: made.name, birthDate: made.birthDate, nationality: made.nationality, position, club: id, clubName: name, generated: 'sim' })
        issue('player-generated', `jogador gerado (${position}) para completar o elenco; trocar por um real`, { club: name, player: made.name, id: made.id })
      })
      issue('squad-generated', `${kept.length} jogadores reais; completado com ${positions.length} gerados`, { club: name, id, field: 'elenco', current: String(kept.length) })
      size += positions.length
    }
    smallest = Math.min(smallest, size)
    largest = Math.max(largest, size)
    if (size < 18) issue('squad-small', `${size} jogadores (o pacote exige de 18 a 30)`, { club: name, id })
  }

  const csvRows = (list: readonly Draft[]) => list.map((d) => PLAYER_COLUMNS.map((column) => d.row[column]))
  const generatedRows = generated.map((row) => PLAYER_COLUMNS.map((column) => row[column]))

  const fame: Record<string, number> = {}
  for (const d of [...main, ...academy, ...free]) fame[d.id] = d.fame

  return {
    leagueId: league.id,
    fame,
    clubsCsv: toCsv(CLUB_COLUMNS, clubRows),
    playersCsv: toCsv(PLAYER_COLUMNS, [...csvRows(main), ...generatedRows, ...csvRows(free)]),
    academyCsv: toCsv(PLAYER_COLUMNS, csvRows(academy)),
    issues,
    stats: {
      clubs: input.clubs.length,
      expected: league.expected,
      players: main.length + generated.length + free.length,
      smallest: Number.isFinite(smallest) ? smallest : 0,
      largest,
      estimated,
      reviewPositions,
      distributed,
      toAcademy: academy.length,
      freed: free.length,
      generated: generated.length,
      colorsFromKit,
    },
  }
}
