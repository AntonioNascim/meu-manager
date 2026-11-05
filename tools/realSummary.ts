/**
 * Resumo de várias sementes da calibração real (Fase 6, recalibração): lê os arquivos `calibracao-real-semente-N.txt` que o workflow
 * `Medições pesadas` (calibracao-real) guarda e junta tudo: títulos nacionais e continentais de cada gigante (média e valores por semente)
 * contra a vida real, o desgaste ao longo dos 30 anos (títulos por década e reputação dos gigantes no começo e no fim) e em quantas sementes ele aparece.
 * Uso: node tools/run.mjs realSummary <pasta com os arquivos .txt>
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface Giant {
  name: string
  league: string
  /** Como o nome aparece nas tabelas dos arquivos. */
  match: string
  /** Títulos nacionais nos últimos 30 anos da vida real (aproximado; os de Inglaterra, Espanha, Itália, Alemanha, França e Brasil estão em `tools/realTargets.ts`). */
  realLeague: string
  /** Copa continental (cont-eu-1 = Champions, cont-sa-1 = Libertadores) e títulos reais nos últimos 30 anos. */
  cup: 'cont-eu-1' | 'cont-sa-1'
  realCup: number
}

const GIANTS: Giant[] = [
  { name: 'Paris Saint-Germain', league: 'fr-1', match: 'Paris Saint-Germain', realLeague: '11', cup: 'cont-eu-1', realCup: 1 },
  { name: 'Bayern Munich', league: 'de-1', match: 'Bayern Munich', realLeague: '22', cup: 'cont-eu-1', realCup: 3 },
  { name: 'Real Madrid', league: 'es-1', match: 'Real Madrid', realLeague: '10', cup: 'cont-eu-1', realCup: 9 },
  { name: 'Barcelona', league: 'es-1', match: 'Barcelona', realLeague: '14', cup: 'cont-eu-1', realCup: 4 },
  { name: 'Manchester United', league: 'en-1', match: 'Manchester United F.C.', realLeague: '11', cup: 'cont-eu-1', realCup: 2 },
  { name: 'Manchester City', league: 'en-1', match: 'Manchester City F.C.', realLeague: '8', cup: 'cont-eu-1', realCup: 1 },
  { name: 'Chelsea', league: 'en-1', match: 'Chelsea', realLeague: '5', cup: 'cont-eu-1', realCup: 2 },
  { name: 'Arsenal', league: 'en-1', match: 'Arsenal', realLeague: '3', cup: 'cont-eu-1', realCup: 0 },
  { name: 'Liverpool', league: 'en-1', match: 'Liverpool', realLeague: '2', cup: 'cont-eu-1', realCup: 2 },
  { name: 'Tottenham', league: 'en-1', match: 'Tottenham Hotspur', realLeague: '0', cup: 'cont-eu-1', realCup: 0 },
  { name: 'Juventus', league: 'it-1', match: 'Juventus', realLeague: '14', cup: 'cont-eu-1', realCup: 1 },
  { name: 'Inter', league: 'it-1', match: 'Inter', realLeague: '6', cup: 'cont-eu-1', realCup: 2 },
  { name: 'Milan', league: 'it-1', match: 'Milan', realLeague: '4', cup: 'cont-eu-1', realCup: 2 },
  { name: 'Napoli', league: 'it-1', match: 'Napoli', realLeague: '2', cup: 'cont-eu-1', realCup: 0 },
  { name: 'Roma', league: 'it-1', match: 'Roma', realLeague: '1', cup: 'cont-eu-1', realCup: 0 },
  { name: 'Flamengo', league: 'br-1', match: 'Flamengo', realLeague: '4', cup: 'cont-sa-1', realCup: 3 },
  { name: 'Palmeiras', league: 'br-1', match: 'Palmeiras', realLeague: '5 a 6', cup: 'cont-sa-1', realCup: 2 },
  { name: 'River Plate', league: 'ar-1', match: 'River Plate', realLeague: '~12 (aprox.)', cup: 'cont-sa-1', realCup: 3 },
  { name: 'Boca Juniors', league: 'ar-1', match: 'Boca Juniors', realLeague: '~12 (aprox.)', cup: 'cont-sa-1', realCup: 4 },
]

interface Seed {
  seed: string
  years: number
  /** Campeões por ano, por competição (liga ou copa). */
  champions: Map<string, string[]>
  /** Reputação dos 6 maiores de cada liga: começo, meio e fim. */
  trail: Map<string, number[]>
}

function parse(text: string, seed: string): Seed {
  const champions = new Map<string, string[]>()
  const trail = new Map<string, number[]>()
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const head = /^### ([a-z]+(?:-[a-z]+)*-\d+)[ :]/.exec(lines[i] ?? '')
    if (head) {
      // O primeiro bloco com "2026: X | 2027: Y" depois do título.
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const row = lines[j] ?? ''
        if (/^\d{4}: /.test(row)) {
          champions.set(head[1] as string, row.split(' | ').map((c) => c.replace(/^\d{4}: /, '').trim()))
          break
        }
      }
    }
    const g = /^([a-z]+-\d+)\s+\+0a rep ([\d.]+).*?\| \+\d+a rep ([\d.]+).*?\| \+\d+a rep ([\d.]+)/.exec(lines[i] ?? '')
    if (g) trail.set(g[1] as string, [Number(g[2]), Number(g[3]), Number(g[4])])
  }
  const any = [...champions.values()][0]
  return { seed, years: any?.length ?? 0, champions, trail }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const f1 = (x: number) => x.toFixed(1)
const count = (rows: string[], club: string, from = 0, to = rows.length) => rows.slice(from, to).filter((c) => c === club).length

function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('Uso: realSummary <pasta com calibracao-real-semente-N.txt>')
  const seeds: Seed[] = readdirSync(dir)
    .filter((f) => /calibracao-real-semente-\d+\.txt$/.test(f))
    .map((f) => parse(readFileSync(join(dir, f), 'utf8'), /semente-(\d+)/.exec(f)?.[1] as string))
    .sort((a, b) => Number(a.seed) - Number(b.seed))
  if (seeds.length === 0) throw new Error('nenhum arquivo calibracao-real-semente-N.txt na pasta')
  const years = Math.min(...seeds.map((s) => s.years))
  const third = Math.floor(years / 3)
  console.log(`# Resumo de ${seeds.length} sementes (${seeds.map((s) => s.seed).join(', ')}), ${years} temporadas cada\n`)

  console.log('## Títulos nacionais por gigante (média das sementes; entre parênteses, cada semente; "vida real" = últimos 30 anos)\n')
  console.log('| Clube | Média | Por semente | Vida real | 1ª década | 2ª | 3ª | Sementes com queda |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const g of GIANTS) {
    const per = seeds.map((s) => s.champions.get(g.league) ?? [])
    const totals = per.map((rows) => count(rows, g.match, 0, years))
    const d1 = per.map((rows) => count(rows, g.match, 0, third))
    const d2 = per.map((rows) => count(rows, g.match, third, 2 * third))
    const d3 = per.map((rows) => count(rows, g.match, 2 * third, years))
    const falling = seeds.filter((_, i) => (d3[i] as number) < (d1[i] as number)).length
    console.log(`| ${g.name} | ${f1(mean(totals))} | ${totals.join(', ')} | ${g.realLeague} | ${f1(mean(d1))} | ${f1(mean(d2))} | ${f1(mean(d3))} | ${falling} de ${seeds.length} |`)
  }

  console.log('\n## Títulos continentais por gigante (Champions = cont-eu-1, Libertadores = cont-sa-1)\n')
  console.log('| Clube | Copa | Média | Por semente | Vida real | 1ª década | 2ª | 3ª |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const g of GIANTS) {
    const per = seeds.map((s) => s.champions.get(g.cup) ?? [])
    const totals = per.map((rows) => count(rows, g.match, 0, years))
    const d = (a: number, b: number) => f1(mean(per.map((rows) => count(rows, g.match, a, b))))
    console.log(`| ${g.name} | ${g.cup === 'cont-eu-1' ? 'Champions' : 'Libertadores'} | ${f1(mean(totals))} | ${totals.join(', ')} | ${g.realCup} | ${d(0, third)} | ${d(third, 2 * third)} | ${d(2 * third, years)} |`)
  }

  console.log('\n## Desgaste: reputação média dos 6 maiores de cada liga (começo → meio → fim), por semente\n')
  const leagues = ['en-1', 'es-1', 'it-1', 'de-1', 'fr-1', 'pt-1', 'nl-1', 'br-1', 'ar-1', 'mx-1']
  console.log(`| Liga | ${seeds.map((s) => `semente ${s.seed}`).join(' | ')} | Queda média | Sementes com queda > 1 |`)
  console.log(`|---|${seeds.map(() => '---').join('|')}|---|---|`)
  for (const id of leagues) {
    const rows = seeds.map((s) => s.trail.get(id))
    const cells = rows.map((r) => (r ? `${f1(r[0] as number)} → ${f1(r[1] as number)} → ${f1(r[2] as number)}` : '-'))
    const drops = rows.filter((r): r is number[] => !!r).map((r) => (r[0] as number) - (r[2] as number))
    console.log(`| ${id} | ${cells.join(' | ')} | ${f1(mean(drops))} | ${drops.filter((d) => d > 1).length} de ${drops.length} |`)
  }
}

main()
