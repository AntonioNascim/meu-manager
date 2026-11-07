/**
 * O "espelho" do mundo da liga no aparelho do técnico (Fase 6C, C2; números da C1 em `docs/fase6c-online-igual-offline.md`, seção 8).
 *
 * O servidor guarda o mundo oficial (`SeasonState`). O aparelho guarda um espelho com **o mesmo formato**, para as telas do jogo solo rodarem sem
 * mudança, mas com três diferenças: (1) **nada oculto sai do servidor**: o `hidden` de todo jogador é substituído por uma estimativa embaçada
 * (`publicHidden`); (2) os jogadores de **outros clubes** chegam em quatro grupos (atributos, estatísticas, condição reduzida, resto) e só os grupos que
 * mudaram vão em cada atualização (a condição física e a moral dos outros não vão: mudam todo dia e pesam ~10x); (3) o **clube do técnico** chega
 * completo a cada resposta (`own`). Puro: serve ao servidor (montar a carga) e ao aparelho (aplicar e montar o `SeasonState`).
 */
import { createRng } from '../rng'
import type { SeasonState } from '../season'
import type { Attributes, Cup, CupHistory, CupSpec, Cycle, Finances, Match, MarketState, Player, PlayerCondition, PlayerSeasonStats, Season, Team, TeamId, TrainingState, TransferOffer } from '../types'
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN } from '../config'

// ---------------------------------------------------------------------------
// Jogador em quatro grupos
// ---------------------------------------------------------------------------

/** Condição que os outros clubes mostram: o resto (física, moral, forma) só vem ao tocar no jogador. */
export interface PublicCondition {
  injuryDaysLeft: number
  suspensionGames: number
  yellowCards: number
  redCards: number
  cups?: PlayerCondition['cups']
}

/** Tudo o que não é atributo, estatística nem condição: identidade, posição, contrato, clube e o `hidden` embaçado. */
export type PlayerRest = Omit<Player, 'attributes' | 'seasonStats' | 'condition'>

export interface PlayerGroups {
  a: Attributes
  s: PlayerSeasonStats
  c: PublicCondition
  r: PlayerRest
}
export type GroupName = keyof PlayerGroups
export const GROUPS: readonly GroupName[] = ['a', 's', 'c', 'r']

/**
 * O que o aparelho vê do potencial e dos atributos ocultos. O potencial vira uma estimativa (erro fixo por jogador e idade, como a das estrelas e da
 * faixa do jogo solo, que ainda somam o erro delas por cima); os outros três viram um valor neutro. O valor de verdade nunca sai do servidor.
 */
export function publicHidden(p: Pick<Player, 'id' | 'age' | 'hidden'>): Player['hidden'] {
  const noise = createRng(`${p.id}:${p.age}:public`).normal(0, 3)
  return { potential: Math.max(ATTRIBUTE_MIN, Math.min(ATTRIBUTE_MAX, Math.round(p.hidden.potential + noise))), consistency: 50, injuryProneness: 50, professionalism: 50 }
}

const publicCondition = (c: PlayerCondition): PublicCondition => ({ injuryDaysLeft: c.injuryDaysLeft, suspensionGames: c.suspensionGames, yellowCards: c.yellowCards, redCards: c.redCards, ...(c.cups ? { cups: c.cups } : {}) })

export function groupsOf(p: Player): PlayerGroups {
  const { attributes, seasonStats, condition, ...r } = p
  return { a: attributes, s: seasonStats, c: publicCondition(condition), r: { ...r, hidden: publicHidden(p) } }
}

/** O jogador como o aparelho o monta: condição física e moral neutras (só o clube do técnico as tem de verdade). */
export function playerFromGroups(g: PlayerGroups): Player {
  return { ...g.r, attributes: g.a, seasonStats: g.s, condition: { fitness: 100, morale: 70, form: 0, recentRatings: [], ...g.c } }
}

/** Jogador do clube do técnico: completo (condição, moral, notas), só com o `hidden` embaçado. */
export const ownPlayer = (p: Player): Player => ({ ...p, hidden: publicHidden(p) })

/** Time de outro clube: sem finanças (a tela só mostra as do técnico). */
const EMPTY_FINANCES: Finances = { balance: 0, salaryBudget: 0, transferBudget: 0, ledger: [], pastSeasons: [], budgetShift: 0, purchaseBonus: 0, fundsRequests: [] }
export const publicTeam = (t: Team): Team => ({ ...t, finances: EMPTY_FINANCES })

// ---------------------------------------------------------------------------
// O que mudou entre dois mundos
// ---------------------------------------------------------------------------

/** Pedaços do mundo que vão inteiros quando mudam. `own` não vai como pedaço: marca que o treino ou a base mudaram (o clube do técnico vai na atualização). */
export type MirrorSection = 'season' | 'cycles' | 'focus' | 'cups' | 'cupSpecs' | 'cupHistory' | 'market' | 'counter' | 'own'
export const SECTIONS: readonly Exclude<MirrorSection, 'own'>[] = ['season', 'cycles', 'focus', 'cups', 'cupSpecs', 'cupHistory', 'market', 'counter']

export interface MirrorChange {
  /** Jogador → letras dos grupos que mudaram (`asrc`). Quem apareceu tem todos. */
  players: Record<string, string>
  removedPlayers: string[]
  teams: string[]
  removedTeams: string[]
  matches: string[]
  removedMatches: string[]
  sections: MirrorSection[]
}

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)
function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false
  return true
}

/** Letras dos grupos do jogador que mudaram (vazio = nada que o aparelho veja). */
function changedGroups(prev: Player, next: Player): string {
  if (prev === next) return ''
  let out = ''
  if (!shallowEqual(prev.attributes, next.attributes)) out += 'a'
  if (prev.seasonStats !== next.seasonStats && !same(prev.seasonStats, next.seasonStats)) out += 's'
  const pc = prev.condition
  const nc = next.condition
  if (pc !== nc && (pc.injuryDaysLeft !== nc.injuryDaysLeft || pc.suspensionGames !== nc.suspensionGames || pc.yellowCards !== nc.yellowCards || pc.redCards !== nc.redCards || !same(pc.cups, nc.cups))) out += 'c'
  const { attributes: _a1, seasonStats: _s1, condition: _c1, hidden: h1, ...r1 } = prev
  const { attributes: _a2, seasonStats: _s2, condition: _c2, hidden: h2, ...r2 } = next
  const keys = new Set([...Object.keys(r1), ...Object.keys(r2)])
  let restChanged = h1.potential !== h2.potential
  for (const k of keys) {
    if (restChanged) break
    const x = (r1 as Record<string, unknown>)[k]
    const y = (r2 as Record<string, unknown>)[k]
    if (x !== y && !same(x, y)) restChanged = true
  }
  if (restChanged) out += 'r'
  return out
}

/** Compara dois mundos (o motor é imutável: o que não mudou tem a mesma referência e custa quase nada). */
export function diffWorlds(prev: SeasonState, next: SeasonState): MirrorChange {
  const players: Record<string, string> = {}
  const before = new Map(prev.players.map((p) => [p.id, p] as const))
  const seen = new Set<string>()
  for (const p of next.players) {
    seen.add(p.id)
    const old = before.get(p.id)
    const g = old ? changedGroups(old, p) : 'asrc'
    if (g) players[p.id] = g
  }
  const removedPlayers = prev.players.filter((p) => !seen.has(p.id)).map((p) => p.id)
  const teamsBefore = new Map(prev.teams.map((t) => [t.id, t] as const))
  const teams = next.teams.filter((t) => teamsBefore.get(t.id) !== t && !same(teamsBefore.get(t.id), t)).map((t) => t.id)
  const teamIds = new Set(next.teams.map((t) => t.id))
  const matchesBefore = new Map(prev.matches.map((m) => [m.id, m] as const))
  const matches: string[] = []
  const matchIds = new Set<string>()
  for (const m of next.matches) {
    matchIds.add(m.id)
    const old = matchesBefore.get(m.id)
    if (old !== m && (!old || !same(old, m))) matches.push(m.id)
  }
  const sections: MirrorSection[] = []
  if (prev.season !== next.season) sections.push('season')
  if (prev.cycles !== next.cycles) sections.push('cycles')
  if (prev.focus !== next.focus) sections.push('focus')
  if (prev.cups !== next.cups) sections.push('cups')
  if (prev.cupSpecs !== next.cupSpecs) sections.push('cupSpecs')
  if (prev.cupHistory !== next.cupHistory) sections.push('cupHistory')
  if (prev.market !== next.market) sections.push('market')
  if (prev.playerCounter !== next.playerCounter) sections.push('counter')
  if (prev.training !== next.training || prev.academy !== next.academy) sections.push('own')
  return { players, removedPlayers, teams, removedTeams: prev.teams.filter((t) => !teamIds.has(t.id)).map((t) => t.id), matches, removedMatches: prev.matches.filter((m) => !matchIds.has(m.id)).map((m) => m.id), sections }
}

/** Junta as mudanças de várias revisões numa só (a ordem é a das revisões). */
export function mergeChanges(list: readonly MirrorChange[]): MirrorChange {
  const out: MirrorChange = { players: {}, removedPlayers: [], teams: [], removedTeams: [], matches: [], removedMatches: [], sections: [] }
  const removedP = new Set<string>()
  const removedT = new Set<string>()
  const removedM = new Set<string>()
  const teams = new Set<string>()
  const matches = new Set<string>()
  const sections = new Set<MirrorSection>()
  for (const c of list) {
    for (const [id, g] of Object.entries(c.players)) {
      removedP.delete(id)
      const have = out.players[id] ?? ''
      out.players[id] = [...new Set([...have, ...g])].join('')
    }
    for (const id of c.removedPlayers) {
      delete out.players[id]
      removedP.add(id)
    }
    for (const id of c.teams) (teams.add(id), removedT.delete(id))
    for (const id of c.removedTeams) (teams.delete(id), removedT.add(id))
    for (const id of c.matches) (matches.add(id), removedM.delete(id))
    for (const id of c.removedMatches) (matches.delete(id), removedM.add(id))
    for (const s of c.sections) sections.add(s)
  }
  return { ...out, removedPlayers: [...removedP], teams: [...teams], removedTeams: [...removedT], matches: [...matches], removedMatches: [...removedM], sections: [...sections] }
}

// ---------------------------------------------------------------------------
// A carga que vai ao aparelho
// ---------------------------------------------------------------------------

/** O que só o técnico tem completo. */
export interface OwnPart {
  teamId: TeamId
  team: Team
  players: Player[]
  academy: Player[]
  training: TrainingState
  /** Clubes de técnicos humanos da liga (o mercado da IA não negocia por eles). */
  humans?: TeamId[]
  /** Propostas e pré-contratos do clube. */
  offers: TransferOffer[]
  preContracts: MarketState['preContracts']
}

export interface MirrorSections {
  season: Omit<Season, 'matchIds'>
  cycles: Record<string, Cycle>
  focus: string | null
  cups: Cup[]
  cupSpecs: CupSpec[]
  cupHistory: CupHistory | null
  /** Mercado público: anúncios e histórico; as propostas e pré-contratos do clube vão em `own`. */
  market: MarketState
  counter: number
}

export interface MirrorPlayerPatch {
  id: string
  a?: Attributes
  s?: PlayerSeasonStats
  c?: PublicCondition
  r?: PlayerRest
}

export interface MirrorPayload {
  rev: number
  /** `null` = carga completa (em páginas). */
  since: number | null
  full: boolean
  page?: number
  pages?: number
  sections?: Partial<MirrorSections>
  teams?: Team[]
  removedTeams?: string[]
  players?: MirrorPlayerPatch[]
  removedPlayers?: string[]
  matches?: Match[]
  removedMatches?: string[]
  own?: OwnPart
}

/** Jogadores por página da carga completa (~2 MB de texto cada). */
export const FULL_PAGE_PLAYERS = 2_500

export function ownPart(world: SeasonState, teamId: TeamId, humans?: readonly TeamId[]): OwnPart {
  const team = world.teams.find((t) => t.id === teamId) as Team
  const mine = new Set(world.players.filter((p) => p.teamId === teamId).map((p) => p.id))
  const history: TrainingState['history'] = {}
  for (const id of mine) if (world.training.history[id]) history[id] = world.training.history[id] as TrainingState['history'][string]
  const t = world.training
  return {
    teamId,
    team,
    ...(humans ? { humans: [...humans] } : {}),
    players: world.players.filter((p) => p.teamId === teamId).map(ownPlayer),
    academy: world.academy.filter((p) => p.teamId === teamId).map(ownPlayer),
    training: { plans: t.plans[teamId] ? { [teamId]: t.plans[teamId] } : {}, individual: t.individual[teamId] ? { [teamId]: t.individual[teamId] } : {}, finished: t.finished[teamId] ? { [teamId]: t.finished[teamId] } : {}, history },
    offers: world.market.offers.filter((o) => o.buyerId === teamId || o.sellerId === teamId),
    preContracts: world.market.preContracts.filter((c) => c.fromTeamId === teamId || c.toTeamId === teamId),
  }
}

function sectionValue(world: SeasonState, name: Exclude<MirrorSection, 'own'>): MirrorSections[Exclude<MirrorSection, 'own'>] {
  switch (name) {
    case 'season': {
      const { matchIds: _ids, ...season } = world.season
      return season
    }
    case 'cycles':
      return world.cycles
    case 'focus':
      return world.focus ?? null
    case 'cups':
      return world.cups ?? []
    case 'cupSpecs':
      return world.cupSpecs ?? []
    case 'cupHistory':
      return world.cupHistory ?? null
    case 'market':
      return { ...world.market, offers: [], preContracts: [] }
    case 'counter':
      return world.playerCounter
  }
}

function patchOf(p: Player, letters: string): MirrorPlayerPatch {
  const g = groupsOf(p)
  const out: MirrorPlayerPatch = { id: p.id }
  if (letters.includes('a')) out.a = g.a
  if (letters.includes('s')) out.s = g.s
  if (letters.includes('c')) out.c = g.c
  if (letters.includes('r')) out.r = g.r
  return out
}

/** A atualização desde a revisão `since` (as mudanças juntas já em `change`). */
export function buildDelta(world: SeasonState, teamId: TeamId, rev: number, since: number, change: MirrorChange, humans?: readonly TeamId[]): MirrorPayload {
  const byId = new Map(world.players.map((p) => [p.id, p] as const))
  const teams = new Map(world.teams.map((t) => [t.id, t] as const))
  const matches = new Map(world.matches.map((m) => [m.id, m] as const))
  const sections: Partial<MirrorSections> = {}
  for (const s of change.sections) if (s !== 'own') (sections as Record<string, unknown>)[s] = sectionValue(world, s)
  const empty = change.sections.length === 0 && change.teams.length === 0 && change.matches.length === 0 && change.removedTeams.length === 0 && change.removedMatches.length === 0 && change.removedPlayers.length === 0 && Object.keys(change.players).length === 0
  return {
    rev,
    since,
    full: false,
    sections,
    teams: change.teams.flatMap((id) => (teams.has(id) ? [publicTeam(teams.get(id) as Team)] : [])),
    removedTeams: change.removedTeams,
    players: Object.entries(change.players).flatMap(([id, letters]) => (byId.has(id) ? [patchOf(byId.get(id) as Player, letters)] : [])),
    removedPlayers: change.removedPlayers,
    matches: change.matches.flatMap((id) => (matches.has(id) ? [matches.get(id) as Match] : [])),
    removedMatches: change.removedMatches,
    // O clube do técnico vai quando algo mudou (o aparelho não sabe o que): quem pergunta na mesma revisão recebe só o aviso de que não há novidade.
    ...(empty ? {} : { own: ownPart(world, teamId, humans) }),
  }
}

/** A carga completa, página a página: a 0 leva tudo menos os jogadores; as seguintes levam os jogadores. */
export function buildFull(world: SeasonState, teamId: TeamId, rev: number, page: number, humans?: readonly TeamId[]): MirrorPayload {
  const pages = 1 + Math.ceil(world.players.length / FULL_PAGE_PLAYERS)
  if (page > 0) {
    const slice = world.players.slice((page - 1) * FULL_PAGE_PLAYERS, page * FULL_PAGE_PLAYERS)
    return { rev, since: null, full: true, page, pages, players: slice.map((p) => patchOf(p, 'asrc')) }
  }
  const sections: Partial<MirrorSections> = {}
  for (const s of SECTIONS) (sections as Record<string, unknown>)[s] = sectionValue(world, s)
  return { rev, since: null, full: true, page: 0, pages, sections, teams: world.teams.map(publicTeam), matches: world.matches, own: ownPart(world, teamId, humans) }
}

// ---------------------------------------------------------------------------
// No aparelho
// ---------------------------------------------------------------------------

export interface MirrorState {
  rev: number
  sections: Partial<MirrorSections>
  teams: Map<string, Team>
  players: Map<string, PlayerGroups>
  matches: Map<string, Match>
  own?: OwnPart
}

export const emptyMirror = (): MirrorState => ({ rev: -1, sections: {}, teams: new Map(), players: new Map(), matches: new Map() })

/** Aplica uma carga ao espelho (idempotente: a mesma atualização duas vezes dá o mesmo espelho). Devolve um espelho novo. */
export function applyPayload(base: MirrorState, payload: MirrorPayload): MirrorState {
  const full0 = payload.full && payload.page === 0
  const m: MirrorState = full0 ? emptyMirror() : { ...base, sections: { ...base.sections }, teams: new Map(base.teams), players: new Map(base.players), matches: new Map(base.matches) }
  if (payload.sections) m.sections = { ...m.sections, ...payload.sections }
  for (const t of payload.teams ?? []) m.teams.set(t.id, t)
  for (const id of payload.removedTeams ?? []) m.teams.delete(id)
  for (const x of payload.matches ?? []) m.matches.set(x.id, x)
  for (const id of payload.removedMatches ?? []) m.matches.delete(id)
  for (const id of payload.removedPlayers ?? []) m.players.delete(id)
  for (const patch of payload.players ?? []) {
    const have = m.players.get(patch.id)
    const merged = { ...(have ?? {}), ...(patch.a ? { a: patch.a } : {}), ...(patch.s ? { s: patch.s } : {}), ...(patch.c ? { c: patch.c } : {}), ...(patch.r ? { r: patch.r } : {}) } as Partial<PlayerGroups>
    // Um jogador novo só vale com os quatro grupos.
    if (merged.a && merged.s && merged.c && merged.r) m.players.set(patch.id, merged as PlayerGroups)
  }
  if (payload.own) m.own = payload.own
  // Uma carga completa só acaba na última página: a revisão do espelho é a da primeira.
  m.rev = payload.full && (payload.page ?? 0) > 0 ? base.rev : payload.rev
  return m
}

const builtCache = new WeakMap<PlayerGroups, Player>()

/** O `SeasonState` que as telas do jogo solo leem, montado do espelho. Os jogadores que não mudaram reaproveitam o objeto. */
export function toSeasonState(m: MirrorState): SeasonState | undefined {
  const s = m.sections
  if (!s.season || !s.cycles || !m.own || !s.market) return undefined
  const own = m.own
  const mine = new Map(own.players.map((p) => [p.id, p] as const))
  const players: Player[] = []
  for (const [id, g] of m.players) {
    const own1 = mine.get(id)
    if (own1) continue
    let p = builtCache.get(g)
    if (!p) (p = playerFromGroups(g), builtCache.set(g, p))
    players.push(p)
  }
  players.push(...own.players)
  const matches = [...m.matches.values()]
  const teams = [...m.teams.values()].map((t) => (t.id === own.teamId ? own.team : t))
  const market: MarketState = { ...s.market, offers: own.offers, preContracts: own.preContracts }
  return {
    season: { ...s.season, matchIds: matches.map((x) => x.id) },
    matches,
    teams,
    players,
    academy: own.academy,
    market,
    training: own.training,
    cycles: s.cycles,
    ...(s.focus ? { focus: s.focus } : {}),
    ...(s.cups && s.cups.length > 0 ? { cups: s.cups } : {}),
    ...(s.cupSpecs ? { cupSpecs: s.cupSpecs } : {}),
    ...(s.cupHistory ? { cupHistory: s.cupHistory } : {}),
    playerCounter: s.counter ?? 0,
  }
}
