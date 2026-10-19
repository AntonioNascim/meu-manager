/**
 * Longo prazo no mundo de 358 clubes (21 ligas; o arquivo mantém o nome `world282` por causa do workflow): 30 temporadas seguidas com mercado e virada, só o Brasil lance a lance.
 * Leva ~15 minutos, então fica fora do `npm run test:all`: rode `npm run test:long`. As checagens são `expect.soft`: uma que falha não
 * interrompe as outras, e o relatório mostra todas de uma vez (uma rodada custa ~17 minutos). Os números da última rodada estão na
 * seção 14 de docs/fase2-proposta.md; `node tools/run.mjs leagueRun --clubs 282 --years 30` imprime as tabelas.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadWorld } from '../../src/data/package/defaultPackage'
import { validatePackage } from '../../src/data/package/validate'
import { buildScalePackage } from '../../src/diagnostics/scalePackage'
import { FINANCE } from '../../src/engine/config'
import { continentalObserver } from '../../tools/continentalRun'
import type { ContinentalRun } from '../../tools/continentalRun'
import { dynastiesOf, formatDynasties, formatTrend, leagueIds, seriesOf, simulateLeagueYears } from '../../tools/leagueYears'
import type { LeagueRun, LeagueYear } from '../../tools/leagueYears'

const YEARS = 30
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

/** Resumo das copas continentais para o arquivo de relatório: campeões, dinastias e dinheiro. */
function continentalReport(run: ContinentalRun): string {
  const lines: string[] = []
  for (const cup of [...new Set(run.editions.map((e) => e.cup))]) {
    const list = run.editions.filter((e) => e.cup === cup).sort((a, b) => a.year - b.year)
    const titles = titlesOf(list)
    lines.push(`${cup}: ${list.length} edições, ${titles.size} campeões diferentes, máximo ${Math.max(...titles.values())} títulos, ${streakOf(list)} seguidos`)
    lines.push(`   por país: ${[...countBy(list.map((e) => e.winnerPyramid))].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    lines.push(`   por clube: ${[...titles].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(', ')}${titles.size > 10 ? ` (+${titles.size - 10} com menos)` : ''}`)
    lines.push(`   campeões: ${list.map((e) => e.winnerId.replace('team-', '')).join(' ')}`)
  }
  const shares = run.money.filter((m) => m.continental > 0).map((m) => m.continental / Math.max(1, m.revenue))
  const top = [...run.money].map((m) => ({ ...m, share: (m.continental + m.world) / Math.max(1, m.revenue) })).sort((a, b) => b.share - a.share).slice(0, 8)
  lines.push(`maiores dependências das copas continentais e mundiais (clube, ano, país, reputação, continental, mundial, receita): ${top.map((m) => `${m.teamId.replace('team-', '')} ${m.year} ${m.pyramid} rep${m.reputation} ${(m.continental / 1e6).toFixed(1)}M+${(m.world / 1e6).toFixed(1)}M/${(m.revenue / 1e6).toFixed(0)}M=${(100 * m.share).toFixed(0)}%`).join('; ')}`)
  lines.push(`dinheiro continental / receita: média ${(100 * mean(shares)).toFixed(1)}%, máximo ${(100 * Math.max(...shares)).toFixed(1)}% (${shares.length} clube-temporadas)`)
  lines.push(`reputação do campeão na virada: ${mean(run.reputationAfter.map((r) => r.after - r.before)).toFixed(2)} (${run.reputationAfter.length} títulos)`)
  return lines.join('\n')
}

function titlesOf(list: { winnerId: string }[]): Map<string, number> {
  const titles = new Map<string, number>()
  for (const e of list) titles.set(e.winnerId, (titles.get(e.winnerId) ?? 0) + 1)
  return titles
}

/** A maior sequência de títulos seguidos do mesmo clube (1 = ninguém repetiu). */
function streakOf(list: { winnerId: string }[]): number {
  let best = 1
  let run = 1
  list.forEach((e, i) => {
    run = i > 0 && list[i - 1]?.winnerId === e.winnerId ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

function countBy(values: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const v of values) out.set(v, (out.get(v) ?? 0) + 1)
  return out
}

describe(`${YEARS} temporadas no mundo de 358 clubes`, () => {
  let runs: LeagueRun[] = []
  let continental: ContinentalRun
  let ids: string[] = []
  beforeAll(() => {
    // O mundo do jogo: pacote de 21 ligas importado como o jogo importa (calendários de cada país, copas nacionais, continentais e mundiais).
    const { pkg } = validatePackage(JSON.parse(JSON.stringify(buildScalePackage(7))))
    const world = loadWorld(7, pkg)
    const watched = continentalObserver()
    continental = watched.run
    runs = simulateLeagueYears({ year: 2026, seed: 'years-7', teams: world.teams, players: world.players, academy: world.academy, competitions: world.competitions!, focus: 'Brazil', ...(world.cups ? { cupSpecs: world.cups } : {}) }, YEARS, watched.observer)
    console.log(`\n${world.teams.length} clubes, ${YEARS} anos\n${formatTrend(runs)}\n\n${formatDynasties(runs)}`)
    // O vitest só mostra o console quando o teste falha: o relatório também vai para um arquivo.
    mkdirSync('node_modules/.cache', { recursive: true })
    writeFileSync('node_modules/.cache/world282.txt', `${world.teams.length} clubes, ${YEARS} anos
${formatTrend(runs)}

${formatDynasties(runs)}
`)
    ids = leagueIds(runs)
    writeFileSync('node_modules/.cache/continental282.txt', continentalReport(continental))
  })
  const series = (id: string): LeagueYear[] => seriesOf(runs, id)
  const span = (id: string, from: number, to: number, pick: (l: LeagueYear) => number) => mean(series(id).slice(from, to).map(pick))
  const decade = (id: string, d: number, pick: (l: LeagueYear) => number) => span(id, d * 10, d * 10 + 10, pick)

  it('ninguém vai à falência e o caixa não passa do teto', () => {
    for (const id of ids) {
      for (const l of series(id)) {
        expect.soft(l.negativeEver, `${id} no vermelho`).toBe(0)
        expect.soft(l.maxCeilingShare, `${id} saldo / teto`).toBeLessThan(1.5)
      }
      expect.soft(decade(id, 2, (l) => l.meanCeilingShare), `${id} saldo médio / teto`).toBeLessThan(1.2)
    }
  })

  it('a força média de cada liga fica estável', () => {
    for (const id of ids) {
      const first = span(id, 0, 3, (l) => l.strength)
      for (const d of [1, 2]) expect.soft(Math.abs(decade(id, d, (l) => l.strength) - first), `${id} década ${d + 1}`).toBeLessThan(id === 'br-3' ? 5 : (series(id)[0]?.clubs ?? 20) <= 8 ? 5 : 3.5)
      // E não segue andando: a última década é parecida com a anterior.
      expect.soft(Math.abs(decade(id, 2, (l) => l.strength) - decade(id, 1, (l) => l.strength)), `${id} última década`).toBeLessThan(2.5)
    }
  })

  it('as idades e os craques se mantêm', () => {
    for (const id of ids) for (let d = 0; d < 3; d++) {
      const age = decade(id, d, (l) => l.meanAge)
      expect.soft(age, `${id} idade média`).toBeGreaterThan(24)
      expect.soft(age, `${id} idade média`).toBeLessThan(28)
    }
    const stars = (d: number) => mean(Array.from({ length: 10 }, (_, k) => ids.reduce((s, id) => s + (series(id)[d * 10 + k]?.stars ?? 0), 0)))
    expect.soft(stars(0)).toBeGreaterThanOrEqual(10)
    expect.soft(stars(2)).toBeLessThan(stars(0) * 2.5)
    expect.soft(stars(2)).toBeGreaterThan(stars(0) * 0.4)
  })

  it('os melhores jogadores se concentram nas ligas ricas e a fatia da Inglaterra para de crescer', () => {
    const share = (d: number) => decade('en-1', d, (l) => l.top40) / 40
    // A fatia da Inglaterra oscila entre 38% e 51% dos 40 melhores (o mundo gerado pelo pacote já a começa alta); não pode ruir nem passar de 60%.
    expect.soft(share(1)).toBeGreaterThan(share(0) - 0.15)
    expect.soft(share(2)).toBeLessThan(share(1) + 0.08)
    for (const d of [0, 1, 2]) expect.soft(share(d), `fatia da Inglaterra na década ${d + 1}`).toBeLessThan(0.6)
    // Espanha, Alemanha e Itália mantêm jogadores bons: a força dos titulares delas já está coberta pelo teste de estabilidade.
    for (const id of ['es-1', 'de-1', 'it-1']) expect.soft(decade(id, 2, (l) => l.top40)).toBeGreaterThan(0)
  })

  it('copas continentais: campeões variados, sem dinastias, dinheiro limitado e título que dá reputação', () => {
    const cups = [...new Set(continental.editions.map((e) => e.cup))]
    expect.soft(cups.sort()).toEqual(['cont-eu-1', 'cont-eu-2', 'cont-eu-3', 'cont-na-1', 'cont-sa-1', 'cont-sa-2', 'world-1', 'world-2'])
    for (const cup of cups) {
      const list = continental.editions.filter((e) => e.cup === cup).sort((a, b) => a.year - b.year)
      const titles = titlesOf(list)
      // O Mundial de Clubes é de quatro em quatro anos (2029, 2033...): 6 a 7 edições em 30 temporadas.
      const mundial = cup === 'world-2'
      expect.soft(list.length, `${cup} edições`).toBeGreaterThanOrEqual(mundial ? 6 : YEARS - 3)
      expect.soft(titles.size / list.length, `${cup} campeões diferentes`).toBeGreaterThan(mundial ? 0.5 : 0.4)
      // Na copa principal europeia o maior campeão real (Real Madrid) tem ~30% das últimas 30 edições; no Mundial, 35% de poucas edições; nas outras o limite é 20%.
      if (mundial) expect.soft(Math.max(...titles.values()), `${cup} títulos de um clube`).toBeLessThanOrEqual(3)
      else expect.soft(Math.max(...titles.values()) / list.length, `${cup} títulos de um clube`).toBeLessThanOrEqual(cup === 'cont-eu-1' ? 0.3 : 0.2)
      // Até 3 seguidos (o Real Madrid ganhou 3 Champions e 3 Mundiais seguidos; Estudiantes e Independiente, 3 ou mais Libertadores), nunca mais que isso.
      expect.soft(streakOf(list), `${cup} títulos seguidos`).toBeLessThanOrEqual(3)
    }
    // Nenhum país leva quase tudo da copa principal europeia: nos últimos 30 anos reais a Espanha tem ~13 títulos (43%).
    {
      const list = continental.editions.filter((e) => e.cup === 'cont-eu-1')
      const best = Math.max(...countBy(list.map((e) => e.winnerPyramid)).values())
      expect.soft(best / list.length, 'cont-eu-1 fatia do país que mais ganha').toBeLessThanOrEqual(0.45)
    }
    // Copa principal sul-americana, como a Libertadores real (os clubes brasileiros ganharam mais da metade das últimas 30 edições): o Brasil
    // fica entre 40% e 75%, a Argentina em segundo com 15% a 30% e os outros países ganham de vez em quando (pelo menos 1 título: pega o caso grave sem depender da sorte da semente).
    {
      const list = continental.editions.filter((e) => e.cup === 'cont-sa-1')
      const byCountry = countBy(list.map((e) => e.winnerPyramid))
      const share = (country: string) => (byCountry.get(country) ?? 0) / list.length
      const others = [...byCountry].filter(([country]) => country !== 'Brazil' && country !== 'Argentina').reduce((sum, [, n]) => sum + n, 0) / list.length
      expect.soft(share('Brazil'), 'cont-sa-1 fatia do Brasil').toBeGreaterThanOrEqual(0.4)
      expect.soft(share('Brazil'), 'cont-sa-1 fatia do Brasil').toBeLessThanOrEqual(0.75)
      expect.soft(share('Argentina'), 'cont-sa-1 fatia da Argentina').toBeGreaterThanOrEqual(0.15)
      expect.soft(share('Argentina'), 'cont-sa-1 fatia da Argentina').toBeLessThanOrEqual(0.3)
      expect.soft(share('Argentina'), 'cont-sa-1 a Argentina é a segunda').toBeGreaterThanOrEqual(Math.max(0, ...[...byCountry].filter(([c]) => c !== 'Brazil' && c !== 'Argentina').map(([c]) => share(c))))
      expect.soft(Math.round(others * list.length), 'cont-sa-1 títulos dos outros países').toBeGreaterThanOrEqual(1)
    }
    // Copas mundiais: europeus e sul-americanos ganham mais (realista), mas outros continentes aparecem na Intercontinental e ninguém passa de dois títulos seguidos.
    for (const cup of ['world-1', 'world-2']) {
      const list = continental.editions.filter((e) => e.cup === cup)
      const byContinent = countBy(list.map((e) => e.winnerContinent))
      const strong = (byContinent.get('EU') ?? 0) + (byContinent.get('SA') ?? 0)
      expect.soft(strong / list.length, `${cup} fatia de Europa e América do Sul`).toBeGreaterThanOrEqual(0.6)
      expect.soft(byContinent.size, `${cup} continentes diferentes entre os campeões`).toBeGreaterThanOrEqual(cup === 'world-1' ? 2 : 1)
      expect.soft(byContinent.get('EU') ?? 0, `${cup} títulos europeus`).toBeGreaterThanOrEqual(1)
    }
    const worldShares = continental.money.filter((m) => m.world > 0).map((m) => m.world / Math.max(1, m.revenue))
    expect.soft(mean(worldShares), 'dinheiro das copas mundiais / receita (média)').toBeLessThan(0.08)
    expect.soft(Math.max(...worldShares), 'dinheiro das copas mundiais / receita (máximo)').toBeLessThan(0.5)
    const shares = continental.money.filter((m) => m.continental > 0).map((m) => m.continental / Math.max(1, m.revenue))
    expect.soft(mean(shares), 'dinheiro continental / receita (média)').toBeLessThan(0.08)
    expect.soft(Math.max(...shares), 'dinheiro continental / receita (máximo)').toBeLessThan(0.5)
    const delta = mean(continental.reputationAfter.map((r) => r.after - r.before))
    expect.soft(delta, 'reputação do campeão continental').toBeGreaterThan(0)
    expect.soft(delta, 'reputação do campeão continental').toBeLessThan(1.5)
  })

  it('campeões: pontos, raros acima de 92 e dinastias', () => {
    for (const d of dynastiesOf(runs)) {
      // As ligas de elite (África, Ásia e Oceania) têm poucos clubes e outro número de jogos: comparam-se os pontos por jogo (92 pontos em 38 jogos = 2,42).
      const small = (series(d.id)[0]?.clubs ?? 20) <= 8
      const perGame = d.championPoints / 38
      if (small) {
        expect.soft(perGame, `${d.id} pontos por jogo do campeão`).toBeGreaterThan(1.8)
        expect.soft(perGame, `${d.id} pontos por jogo do campeão`).toBeLessThan(2.6)
      } else {
        expect.soft(d.championPoints, `${d.id} pontos do campeão`).toBeGreaterThan(68)
        expect.soft(d.championPoints, `${d.id} pontos do campeão`).toBeLessThan(84)
        expect.soft(d.highCount, `${d.id} campeões acima de 92 pontos`).toBeLessThanOrEqual(3)
      }
    }
    // Divisões de acesso (Brasil B e C): o campeão sobe e sai da divisão, então quase todo ano é um campeão novo; só se exige que ninguém repita muito.
    const tops = dynastiesOf(runs).filter((d) => !['br-2', 'br-3'].includes(d.id)).flatMap((d) => d.blocks)
    expect.soft(mean(tops.map((b) => b.distinct)), 'campeões diferentes por 10 temporadas').toBeGreaterThanOrEqual(4)
    expect.soft(mean(tops.map((b) => b.distinct)), 'campeões diferentes por 10 temporadas').toBeLessThanOrEqual(8)
    expect.soft(tops.filter((b) => b.maxTitles > 5).length / tops.length, 'blocos com um clube de mais de 5 títulos').toBeLessThan(0.2)
    for (const d of dynastiesOf(runs).filter((x) => ['br-2', 'br-3'].includes(x.id))) for (const b of d.blocks) expect.soft(b.maxTitles, `${d.id} títulos de um clube`).toBeLessThanOrEqual(4)
    expect.soft(FINANCE.ceilingYears).toBeGreaterThan(0)
  })
})
