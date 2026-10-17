/**
 * Pacote de dados de exemplo com as 15 ligas do mundo de teste (282 clubes): só o que um pacote real traria (clubes e jogadores
 * com nome, nascimento, nacionalidade, posição e pé; sem atributos, contratos, táticas nem finanças), para testar a
 * importação no celular e medir quanto custa importar e começar um jogo. Tudo inventado. Usado por `tools/exportScalePackage.ts`
 * e pela tela `?diagnostico=1`.
 */
import { BRAZILIAN_FIRST_NAMES, BRAZILIAN_SURNAMES, SPANISH_FIRST_NAMES, SPANISH_SURNAMES } from '../data/names'
import { defaultCupsFor } from '../data/package/countryCups'
import { PACKAGE_FORMAT, PACKAGE_VERSION } from '../data/package/types'
import type { DataPackage, PackageClub, PackageLeague, PackagePlayer } from '../data/package/types'
import { createRng } from '../engine/rng'
import type { Nationality } from '../engine/types'
import { COUNTRY_OF_PYRAMID, FULL_WORLD, buildScaleWorld } from './scaleWorld'

/** País de cada liga do mundo de teste (a pirâmide é o prefixo do id). */
const COUNTRY_OF = COUNTRY_OF_PYRAMID
const COUNTRY_NAME: Partial<Record<Nationality, string>> = { Brazil: 'Brasil', Argentina: 'Argentina', Uruguay: 'Uruguai', Paraguay: 'Paraguai', Chile: 'Chile', Colombia: 'Colômbia', Peru: 'Peru', Ecuador: 'Equador', England: 'Inglaterra', Spain: 'Espanha', Italy: 'Itália', Germany: 'Alemanha', France: 'França', Portugal: 'Portugal' }
const SPANISH_SPEAKING: readonly Nationality[] = ['Argentina', 'Uruguay', 'Paraguay', 'Chile', 'Colombia', 'Peru', 'Ecuador', 'Spain']

/** Limites de estrangeiros do exemplo (para testar a regra; os demais países não têm limite). */
const FOREIGN_LIMITS: Record<string, PackageLeague['foreignLimit']> = { 'ar-1': { squad: 6 }, 'it-1': { lineup: 8 }, 'en-1': { squad: 17 }, 'es-1': { lineup: 9 } }

const PLACE_START = ['Vila', 'Monte', 'Porto', 'Santa', 'Nova', 'Campo', 'Rio', 'Lago', 'Serra', 'Bela', 'Alto', 'Forte', 'Pedra', 'Ponte']
const PLACE_END = ['verde', 'mar', 'real', 'norte', 'sul', 'claro', 'alvo', 'novo', 'branco', 'velho', 'bravo', 'fundo']
const CLUB_KIND = ['Futebol Clube', 'Atlético', 'Sporting', 'Esporte Clube', 'United', 'Deportivo', 'Athletic']
const PALETTE = ['#c8102e', '#111111', '#f2f2f2', '#0b3d91', '#1b7f3b', '#f2b705', '#6a1b9a', '#ee7203', '#00a3c4', '#7a1f1f']

export function buildScalePackage(seed = 7): DataPackage {
  const rng = createRng(`scale-package:${seed}`)
  const world = buildScaleWorld(FULL_WORLD, seed)
  const usedNames = new Set<string>()
  const usedAbbreviations = new Set<string>()
  const usedPlaces = new Set<string>()

  const personName = (nationality: Nationality): string => {
    const spanish = SPANISH_SPEAKING.includes(nationality)
    const firsts = spanish ? SPANISH_FIRST_NAMES : BRAZILIAN_FIRST_NAMES
    const lasts = spanish ? SPANISH_SURNAMES : BRAZILIAN_SURNAMES
    for (let i = 0; ; i++) {
      const name = `${rng.pick(firsts)} ${rng.pick(lasts)}${i > 3 ? ` ${rng.pick(lasts)}` : ''}`
      if (!usedNames.has(name)) {
        usedNames.add(name)
        return name
      }
    }
  }
  const abbreviationOf = (place: string): string => {
    const letters = place.toUpperCase().replace(/[^A-Z]/g, '')
    for (const candidate of [letters.slice(0, 3), letters[0]! + letters.slice(-2), letters.slice(0, 2) + letters.slice(-1)]) if (!usedAbbreviations.has(candidate)) return (usedAbbreviations.add(candidate), candidate)
    for (;;) {
      const candidate = Array.from({ length: 3 }, () => String.fromCharCode(65 + rng.int(0, 25))).join('')
      if (!usedAbbreviations.has(candidate)) return (usedAbbreviations.add(candidate), candidate)
    }
  }

  const leagues: PackageLeague[] = FULL_WORLD.map((spec) => {
    const country = COUNTRY_OF[spec.id.split('-')[0] as string] as Nationality
    const sameCountry = FULL_WORLD.filter((l) => l.id.startsWith(spec.id.split('-')[0] as string))
    const lowest = Math.max(...sameCountry.map((l) => l.tier))
    const isBrazil = country === 'Brazil'
    return {
      id: spec.id,
      name: isBrazil ? spec.name.replace('Brasil ', 'Série ') : `Liga ${COUNTRY_NAME[country]}`,
      country,
      level: spec.tier,
      teams: spec.teams,
      promotion: spec.tier === 1 ? 0 : 4,
      relegation: spec.tier === lowest ? 0 : 4,
      ...(spec.format === 'single' ? { rounds: 1 as const } : {}),
      ...(FOREIGN_LIMITS[spec.id] ? { foreignLimit: FOREIGN_LIMITS[spec.id] } : {}),
    }
  })
  // Quem não tem divisões abaixo não rebaixa nem sobe (a Série C é a última do Brasil; os outros países têm uma liga só).
  for (const l of leagues) if (l.country !== 'Brazil') (l.promotion = 0), (l.relegation = 0)

  const leagueOfTeam = new Map<string, string>()
  world.competitions.forEach((c) => c.teams.forEach((t) => leagueOfTeam.set(t.id, c.id)))
  const clubs: PackageClub[] = world.teams.map((t) => {
    const league = leagues.find((l) => l.id === leagueOfTeam.get(t.id)) as PackageLeague
    let place = ''
    do place = `${rng.pick(PLACE_START)}${rng.pick(PLACE_END)}`
    while (usedPlaces.has(place) && usedPlaces.size < 150)
    usedPlaces.add(place)
    const [c1, c2] = [rng.pick(PALETTE), rng.pick(PALETTE)]
    return {
      id: t.id,
      name: `${place} ${rng.pick(CLUB_KIND)}`,
      abbreviation: abbreviationOf(place),
      colors: [c1, c1 === c2 ? '#f2f2f2' : c2],
      city: place,
      state: '',
      stadium: { name: `Estádio de ${place}`, capacity: t.stadium.capacity },
      reputation: t.reputation,
      league: league.id,
    }
  })

  const clubCountry = new Map(clubs.map((c) => [c.id, (leagues.find((l) => l.id === c.league) as PackageLeague).country as Nationality]))
  const toPlayer = (p: (typeof world.players)[number]): PackagePlayer => {
    const home = clubCountry.get(p.teamId as string) as Nationality
    const nationality: Nationality = rng.chance(0.88) ? home : rng.pick(Object.keys(COUNTRY_NAME) as Nationality[])
    const out: PackagePlayer = {
      name: personName(nationality),
      birthDate: p.birthDate,
      nationality,
      position: p.position,
      secondaryPositions: [...p.secondaryPositions],
      foot: p.foot,
      club: p.teamId,
    }
    return out
  }
  const players = world.players.map(toPlayer)
  const countries = Object.entries(COUNTRY_NAME)
    .filter(([id]) => leagues.some((l) => l.country === id))
    .map(([id, name]) => ({ id, name }))

  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    name: 'Mundo fictício com 15 ligas (exemplo)',
    startYear: 2026,
    credits: 'Pacote de exemplo gerado pelo próprio jogo: clubes, cidades e jogadores inventados, sem dados reais. Atributos, contratos, táticas e finanças ficam por conta do jogo.',
    countries,
    leagues,
    clubs,
    players,
    // As copas padrão de cada país (Brasil, Inglaterra, Espanha, Itália, Alemanha, França, Portugal e Argentina).
    cups: countries.flatMap((c) => defaultCupsFor(c.id as Nationality, leagues.filter((l) => l.country === c.id))),
  }
}
