/**
 * Resumo e comparação de várias medições de 30 anos (Fase 6D): junta as sementes de cada grupo (calibracao-real, calibracao-liga-online ou uma rodada
 * anterior) e compara os grupos lado a lado: campeões de cada liga, concentração das copas, desgaste da reputação dos 6 maiores, estrelas levadas pelo freio
 * contra dinastias e os alertas das metas. Lê os `.txt` que o workflow `Medições pesadas` guarda (procura em subpastas; a semente vem do nome `semente-N`).
 * Uso: node tools/run.mjs medicaoResumo "rotulo=pasta" ["rotulo=pasta" ...]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Run {
  seed: string
  file: string
  leagues: Map<string, { name: string; clubs: number; distinct: number; topShare: number; top: string; champions: string[] }>
  cups: Map<string, { editions: number; distinct: number; countries: [string, number][]; clubs: [string, number][] }>
  rep: Map<string, [number, number]>
  raids: Map<string, number>
  alerts: string[]
}

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/semente-\d+\.txt$/.test(name)) out.push(p)
  }
  return out
}

function pairs(text: string): [string, number][] {
  return text
    .split(', ')
    .map((x) => /^(.*) (\d+)$/.exec(x.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1] as string, Number(m[2])])
}

function parse(file: string): Run {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const run: Run = { seed: /semente-(\d+)/.exec(file)?.[1] ?? '?', file, leagues: new Map(), cups: new Map(), rep: new Map(), raids: new Map(), alerts: [] }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? ''
    const lg = /^### ([a-z]{2}-\d) (.+?) \((\d+) clubes\): (\d+) campeões diferentes; mais títulos: (.+?) \(máx (\d+)%\)/.exec(l)
    if (lg) {
      const years = (lines[i + 1] ?? '').split(' | ').map((c) => c.replace(/^\d{4}: /, '').trim())
      run.leagues.set(lg[1] as string, { name: lg[2] as string, clubs: Number(lg[3]), distinct: Number(lg[4]), topShare: Number(lg[6]) / 100, top: (lg[5] as string).split(',')[0] as string, champions: years })
    }
    const cp = /^### ((?:cont|world)-[a-z]+-?\d?): (\d+) edições, (\d+) campeões diferentes/.exec(l)
    if (cp) {
      const countries = pairs((/^por país: (.*)$/.exec(lines[i + 1] ?? '') ?? [])[1] ?? '')
      const clubs = pairs((/^por clube: (.*)$/.exec(lines[i + 2] ?? '') ?? [])[1] ?? '')
      run.cups.set(cp[1] as string, { editions: Number(cp[2]), distinct: Number(cp[3]), countries, clubs })
    }
    const g = /^([a-z]{2}-\d)\s+\+0a rep ([\d.]+).*\+\d+a rep ([\d.]+) força [\d.]+ \| dos 3/.exec(l)
    if (g) run.rep.set(g[1] as string, [Number(g[2]), Number(g[3])])
    if (l.startsWith('Freio contra dinastias')) for (const [id, n] of pairs(l.replace(/^[^:]*: estrelas levadas do campeão por liga: /, ''))) run.raids.set(id, n)
    if (l.startsWith('ALERTA')) run.alerts.push(l)
  }
  return run
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const f1 = (x: number) => x.toFixed(1)
const pct = (x: number) => `${Math.round(100 * x)}%`

const groups = process.argv.slice(2).map((arg) => {
  const [label, dir] = arg.split('=') as [string, string]
  return { label, runs: files(dir).map(parse).sort((a, b) => Number(a.seed) - Number(b.seed)) }
})
if (groups.length === 0) throw new Error('Uso: medicaoResumo "rotulo=pasta" ...')

const head = (title: string) => console.log(`\n## ${title}\n`)
console.log(`# Comparação de medições de 30 anos\n`)
for (const g of groups) console.log(`- **${g.label}**: ${g.runs.length} sementes (${g.runs.map((r) => r.seed).join(', ')})`)

const LEAGUES = ['br-1', 'ar-1', 'mx-1', 'us-1', 'en-1', 'es-1', 'it-1', 'de-1', 'fr-1', 'pt-1', 'nl-1', 'uy-1', 'co-1']
head('Ligas: campeões diferentes em 30 temporadas (média) e maior fatia de um clube (média / pior semente)')
console.log(`| Liga | ${groups.map((g) => g.label).join(' | ')} |`)
console.log(`|---|${groups.map(() => '---').join('|')}|`)
for (const id of LEAGUES) {
  const cells = groups.map((g) => {
    const rows = g.runs.map((r) => r.leagues.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
    if (!rows.length) return '-'
    return `${f1(mean(rows.map((r) => r.distinct)))} · ${pct(mean(rows.map((r) => r.topShare)))} / ${pct(Math.max(...rows.map((r) => r.topShare)))}`
  })
  console.log(`| ${id} | ${cells.join(' | ')} |`)
}

head('Copas continentais: campeões diferentes (média) e maior fatia de um clube (média / pior semente); país principal')
console.log(`| Copa | ${groups.map((g) => g.label).join(' | ')} |`)
console.log(`|---|${groups.map(() => '---').join('|')}|`)
for (const id of ['cont-eu-1', 'cont-eu-2', 'cont-eu-3', 'cont-sa-1', 'cont-sa-2', 'cont-na-1']) {
  const cells = groups.map((g) => {
    const rows = g.runs.map((r) => r.cups.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
    if (!rows.length) return '-'
    const share = rows.map((r) => ((r.clubs[0]?.[1] ?? 0) / r.editions))
    const top = new Map<string, number[]>()
    for (const r of rows) for (const [c, n] of r.countries) top.set(c, [...(top.get(c) ?? []), n / r.editions])
    const main = [...top].map(([c, v]) => [c, mean(v)] as const).sort((a, b) => b[1] - a[1])[0]
    return `${f1(mean(rows.map((r) => r.distinct)))} · ${pct(mean(share))} / ${pct(Math.max(...share))} · ${main ? `${main[0]} ${pct(main[1])}` : ''}`
  })
  console.log(`| ${id} | ${cells.join(' | ')} |`)
}

head('Desgaste: queda média da reputação dos 6 maiores (começo → fim, pontos) e sementes com queda acima de 2')
console.log(`| Liga | ${groups.map((g) => g.label).join(' | ')} |`)
console.log(`|---|${groups.map(() => '---').join('|')}|`)
for (const id of ['br-1', 'ar-1', 'mx-1', 'en-1', 'es-1', 'it-1', 'de-1', 'fr-1', 'pt-1', 'nl-1']) {
  const cells = groups.map((g) => {
    const drops = g.runs.map((r) => r.rep.get(id)).filter((x): x is [number, number] => !!x).map(([a, b]) => a - b)
    return drops.length ? `${f1(mean(drops))} (${drops.filter((d) => d > 2).length} de ${drops.length})` : '-'
  })
  console.log(`| ${id} | ${cells.join(' | ')} |`)
}

head('Freio contra dinastias: estrelas levadas do campeão em 30 anos (média por semente)')
console.log(`| Liga | ${groups.map((g) => g.label).join(' | ')} |`)
console.log(`|---|${groups.map(() => '---').join('|')}|`)
for (const id of ['br-1', 'ar-1', 'mx-1', 'en-1', 'es-1', 'it-1', 'de-1', 'fr-1', 'pt-1', 'nl-1']) {
  console.log(`| ${id} | ${groups.map((g) => f1(mean(g.runs.map((r) => r.raids.get(id) ?? 0)))).join(' | ')} |`)
}
console.log(`| **todas as ligas** | ${groups.map((g) => f1(mean(g.runs.map((r) => [...r.raids.values()].reduce((a, b) => a + b, 0))))).join(' | ')} |`)

head('Alertas das metas contra a vida real')
for (const g of groups) {
  console.log(`**${g.label}**`)
  const any = g.runs.some((r) => r.alerts.length > 0)
  if (!any) console.log('- nenhum alerta')
  for (const r of g.runs) for (const a of r.alerts) console.log(`- semente ${r.seed}: ${a}`)
  console.log('')
}
