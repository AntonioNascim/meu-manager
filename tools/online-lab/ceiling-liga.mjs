// Teto de memória da liga cheia (B9): segura N MB de lastro, cria a sala real com o mundo real, senta 20 técnicos, inicia (resultado direto) e avança o ADM
// até as viradas de temporada, recarregando tudo do SQLite no meio (o pico da recarga). Uso: LAB_URL=... LABKEY_FILE=... node ceiling-liga.mjs <mb> [seats]
import { readFileSync } from 'node:fs'
const U = process.env.LAB_URL
const key = readFileSync(process.env.LABKEY_FILE, 'utf8').trim()
const mb = process.argv[2] ?? '0'
const room = 'r' + Date.now().toString(36) + mb
const seats = process.argv[3] ?? '20'
const get = async (p, post = false) => {
  const t = performance.now()
  try {
    const r = await fetch(U + p + (p.includes('?') ? '&' : '?') + 'room=' + room, { method: post ? 'POST' : 'GET', headers: { 'x-lab-key': key }, signal: AbortSignal.timeout(180000) })
    return { status: r.status, text: await r.text(), ms: performance.now() - t }
  } catch (e) { return { status: 0, text: String(e), ms: performance.now() - t } }
}
const fail = (what, r) => { console.log(`lastro ${mb} MB: FALHOU em ${what}: ${r.status} ${r.text.slice(0, 220).replace(/\s+/g, ' ')}`); process.exit() }
let r = await get(`/ballast?mb=${mb}`); if (r.status !== 200) fail('lastro', r)
r = await get('/init'); if (r.status !== 200) fail('criar a sala', r)
const created = r.ms
r = await get(`/seats?n=${seats}`); if (r.status !== 200) fail('sentar os técnicos', r)
r = await get('/start', true); if (r.status !== 200) fail('iniciar', r)
const started = r.ms
let chunks = 0, reloads = [], worst = 0, boots = new Set(), startYear, last, lastBoot, restarts = []
for (; chunks < 60; chunks++) {
  r = await get('/adv?n=15')
  if (r.status !== 200) fail(`avanço (bloco ${chunks + 1}, ${last?.date ?? '?'})`, r)
  last = JSON.parse(r.text)
  startYear ??= last.minYear
  boots.add(last.boot)
  if (lastBoot !== undefined && last.boot !== lastBoot) restarts.push(`bloco ${chunks + 1} (${last.date})`)
  lastBoot = last.boot
  worst = Math.max(worst, r.ms)
  if ([4, 12, 24, 36].includes(chunks)) {
    const re = await get('/reload')
    if (re.status !== 200 || !JSON.parse(re.text).ok) fail(`recarga (bloco ${chunks + 1})`, re)
    reloads.push(Math.round(re.ms))
  }
  if (last.minYear > startYear) break
}
const info = JSON.parse((await get('/info')).text || '{}')
console.log(`lastro ${mb} MB: ok | criar ${Math.round(created)} ms, iniciar ${Math.round(started)} ms | ${chunks + 1} blocos de 15 avanços até ${last.date} (anos dos ciclos ${last.minYear}..${last.maxYear}) | pior bloco de 15 avanços ${Math.round(worst)} ms (relógio do cliente) | recargas do SQLite ${reloads.join('/')} ms | boots vistos ${[...boots].join(',')}${restarts.length ? ' REINICIOS em: ' + restarts.join('; ') : ''} | banco ${(last.dbBytes / 1e6).toFixed(1)} MB | lastro ainda lá: ${info.ballastMB ?? 0} MB`)
