/**
 * Amostra da API-Football (plano gratuito) como fonte extra: NÃO substitui nada do `buildRealSheets`; só compara o que a API traz a mais
 * (nascimento, posição, estatísticas da temporada) com as planilhas que já temos em `dados-reais/planilhas`.
 *
 * Uso: npm run dados:apifootball -- [--season 2024] [--limite 60] [--clubes br-3:Nome,ec-1:Nome,...] [--status]
 *  - A chave vem de `.env` (API_FOOTBALL_KEY); nunca é impressa nem gravada em cache.
 *  - Cota: contador do dia em `dados-reais/api-football/uso.json` (limite padrão 60 de 100) e conferência com o cabeçalho
 *    `x-ratelimit-requests-remaining` da própria API. Respostas ficam em cache (repetir não gasta consulta).
 *  - `--status` só consulta /status (não conta na cota) e mostra o plano e a cota.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://v3.football.api-sports.io'
const DIR = join('dados-reais', 'api-football')
const SHEETS = join('dados-reais', 'planilhas')

/** Amostra padrão: Série A, Série C, Equador e ligas de elite da África e da Ásia (nome como está na planilha de clubes). */
const DEFAULT_SAMPLE = ['br-1:Flamengo', 'br-3:*', 'ec-1:Barcelona', 'af-1:Al Ahly SC', 'as-1:*']

function readEnv(): string {
  const text = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
  const line = text.split(/\r?\n/).find((l) => l.startsWith('API_FOOTBALL_KEY='))
  const key = (line ?? '').slice('API_FOOTBALL_KEY='.length).trim().replace(/^["']|["']$/g, '')
  if (!key) {
    console.error('Chave ausente: cole a sua em .env, na linha API_FOOTBALL_KEY= (sem aspas).')
    process.exit(1)
  }
  return key
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const today = new Date().toISOString().slice(0, 10)
const usageFile = join(DIR, 'uso.json')
mkdirSync(join(DIR, 'cache'), { recursive: true })
const usage: { date: string; used: number; remainingHeader?: number } = existsSync(usageFile) ? JSON.parse(readFileSync(usageFile, 'utf8')) : { date: today, used: 0 }
if (usage.date !== today) {
  usage.date = today
  usage.used = 0
}
const limit = Number(arg('limite') ?? 60)
const key = readEnv()
let network = 0
let cached = 0

interface Envelope<T> {
  errors: unknown
  results: number
  paging?: { current: number; total: number }
  response: T[]
}

async function api<T>(path: string, params: Record<string, string | number>, counts = true): Promise<Envelope<T>> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
  const url = `${BASE}${path}${query ? `?${query}` : ''}`
  const file = join(DIR, 'cache', `${createHash('sha1').update(url).digest('hex')}.json`)
  if (existsSync(file)) {
    cached++
    return JSON.parse(readFileSync(file, 'utf8')) as Envelope<T>
  }
  if (counts && usage.used >= limit) throw new Error(`Limite de ${limit} consultas do dia atingido (usadas: ${usage.used}). Aumente --limite só se a cota diária (100) permitir.`)
  const response = await fetch(url, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(60_000) })
  if (counts) usage.used++
  network++
  const remaining = Number(response.headers.get('x-ratelimit-requests-remaining'))
  if (Number.isFinite(remaining)) usage.remainingHeader = remaining
  writeFileSync(usageFile, JSON.stringify(usage))
  if (response.status !== 200) throw new Error(`HTTP ${response.status} em ${path}`)
  const text = await response.text()
  const json = JSON.parse(text) as Envelope<T>
  const hasErrors = Array.isArray(json.errors) ? json.errors.length > 0 : Object.keys((json.errors as object) ?? {}).length > 0
  if (!hasErrors) writeFileSync(file, text) // erro (plano, limite) não vai para o cache
  return json
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim()

type Row = Record<'id' | 'name' | 'nickname' | 'birthDate' | 'birthEstimated' | 'position' | 'club', string>

function parseCsv(file: string): Row[] {
  const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  const header = (lines[0] as string).split(';')
  return lines.slice(1).map((l) => {
    const cells = l.split(';')
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) as Row
  })
}

interface ApiTeam { team: { id: number; name: string; country: string }; venue?: { name?: string } }
interface ApiPlayerRow {
  player: { id: number; name: string; firstname?: string; lastname?: string; age?: number; birth?: { date?: string | null; country?: string | null }; nationality?: string; injured?: boolean }
  statistics: { team: { id: number }; league: { id: number; name: string; season: number }; games: { appearences: number | null; minutes: number | null; position: string | null; rating: string | null; lineups: number | null }; goals: { total: number | null; assists: number | null }; cards: { yellow: number | null; red: number | null } }[]
}

async function main(): Promise<void> {
  if (process.argv.includes('--status')) {
    const s = await api<{ subscription: { plan: string; end: string; active: boolean }; requests: { current: number; limit_day: number } }>('/status', {}, false)
    console.log(JSON.stringify(s.response, null, 2))
    return
  }
  const season = Number(arg('season') ?? new Date().getFullYear())
  const sample = (arg('clubes')?.split(',') ?? DEFAULT_SAMPLE).map((s) => s.split(':') as [string, string])
  const out: string[] = [`# Amostra API-Football — temporada ${season}`, '']
  const totals = { ours: 0, matched: 0, birthOursEst: 0, birthOursMissing: 0, birthApi: 0, withStats: 0, positions: new Map<string, number>() }

  for (const [league, wanted] of sample) {
    const clubs = parseCsv(join(SHEETS, `${league}-clubes.csv`))
    const club = wanted === '*' ? clubs[Math.floor(clubs.length / 2)] : clubs.find((c) => c.name === wanted)
    if (!club) { out.push(`## ${league}: clube "${wanted}" não encontrado na planilha`, ''); continue }
    out.push(`## ${club.name} (${league})`)
    const search = await api<ApiTeam>('/teams', { search: club.name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(' ').filter((w) => w.length > 2).slice(0, 2).join(' ') })
    if (!search.response.length) { out.push(`- API não achou o clube. Erros: ${JSON.stringify(search.errors)}`, ''); continue }
    const team = search.response.find((r) => norm(r.team.name) === norm(club.name)) ?? search.response[0] as ApiTeam
    out.push(`- API: "${team.team.name}" (${team.team.country}, id ${team.team.id}); candidatos: ${search.response.length}`)

    const rows: ApiPlayerRow[] = []
    let page = 1
    for (;;) {
      const r = await api<ApiPlayerRow>('/players', { team: team.team.id, season, page })
      if (r.errors && JSON.stringify(r.errors) !== '[]' && JSON.stringify(r.errors) !== '{}') { out.push(`- ERRO da API (temporada ${season}): ${JSON.stringify(r.errors)}`); break }
      rows.push(...r.response)
      if (!r.paging || page >= r.paging.total) break
      page++
    }
    const ours = parseCsv(join(SHEETS, `${league}-jogadores.csv`)).filter((p) => p.club === club.id)
    const byName = new Map(rows.map((r) => [norm(r.player.name), r]))
    let matched = 0, apiBirth = 0, ourEst = 0, ourMissing = 0, stats = 0
    const examples: string[] = []
    for (const p of ours) {
      const hit = [...byName.entries()].find(([n]) => n === norm(p.name) || n === norm(p.nickname) || (norm(p.name).split(' ').pop() === n.split(' ').pop() && norm(p.name)[0] === n[0]))?.[1]
      if (p.birthEstimated) ourEst++
      if (!p.birthDate) ourMissing++
      if (!hit) continue
      matched++
      if (hit.player.birth?.date) apiBirth++
      const st = hit.statistics.find((s) => s.team.id === team.team.id) ?? hit.statistics[0]
      if (st && (st.games.appearences ?? 0) > 0) stats++
      if (st?.games.position) totals.positions.set(st.games.position, (totals.positions.get(st.games.position) ?? 0) + 1)
      if (examples.length < 4 && st) examples.push(`${hit.player.name}: nasc. ${hit.player.birth?.date ?? '—'} (nosso: ${p.birthDate || '—'}${p.birthEstimated ? ' estimada' : ''}); ${st.games.position ?? '—'} (nosso: ${p.position}); ${st.games.appearences ?? 0} jogos, ${st.games.minutes ?? 0} min, ${st.goals.total ?? 0} g, ${st.goals.assists ?? 0} a, nota ${st.games.rating ? Number(st.games.rating).toFixed(2) : '—'}`)
    }
    out.push(`- Nosso elenco: ${ours.length}; API: ${rows.length}; casados por nome: ${matched}`)
    out.push(`- Data de nascimento: API em ${apiBirth}/${matched} casados; nossas datas estimadas: ${ourEst}, em branco: ${ourMissing}`)
    out.push(`- Com estatísticas (≥1 jogo) na temporada ${season}: ${stats}/${matched}`)
    for (const e of examples) out.push(`  - ${e}`)
    out.push('')
    totals.ours += ours.length; totals.matched += matched; totals.birthOursEst += ourEst; totals.birthOursMissing += ourMissing; totals.birthApi += apiBirth; totals.withStats += stats
  }
  out.push('## Totais da amostra', `- Jogadores nossos: ${totals.ours}; casados: ${totals.matched}; nascimento da API: ${totals.birthApi}; estimados nossos: ${totals.birthOursEst}; em branco nossos: ${totals.birthOursMissing}; com estatísticas: ${totals.withStats}`)
  out.push(`- Posições da API (valores distintos): ${[...totals.positions].map(([k, v]) => `${k}=${v}`).join(', ') || '—'}`)
  out.push(`- Consultas: ${network} na rede, ${cached} do cache; usadas hoje: ${usage.used}/${limit} (cabeçalho da API, restantes: ${usage.remainingHeader ?? '?'})`)
  writeFileSync(join(DIR, 'amostra.md'), out.join('\n'))
  console.log(out.join('\n'))
}

main().catch((e) => { console.error(String(e).replace(key, '***')); process.exit(1) })
