// B5 no Cloudflare: joga uma temporada do mundo real no Durable Object (SqliteWorldStore), com reinícios simulados (/reload) e um reinício real (/crash).
// Uso: LAB_URL=https://lab-meumanager-b5.<subdominio>.workers.dev LABKEY_FILE=<arquivo fora do repositório> node measure-b5.mjs
import { readFileSync } from 'node:fs'
const U = process.env.LAB_URL
const key = readFileSync(process.env.LABKEY_FILE, 'utf8').trim()
const get = async (p) => {
  const t = performance.now()
  const r = await fetch(U + p, { headers: { 'x-lab-key': key } })
  const text = await r.text()
  return { ms: performance.now() - t, status: r.status, text }
}
const json = (r) => JSON.parse(r.text)
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const sum = (a) => a.reduce((x, y) => x + y, 0)
let bad = 0
const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ' — ' + detail : ''}`) }

await get('/wipe')
const load = await get('/load')
const l = json(load)
console.log(`load: ${Math.round(load.ms)} ms (inclui criar o mundo e gravar) | ${l.teams} clubes, ${l.players} jogadores | gravação: ${l.save.parts} pedaços, ${l.save.rowsWritten} linhas, maior ${(l.save.largestChars / 1024).toFixed(0)} KB | banco ${l.dbMB.toFixed(1)} MB | boot ${l.boot}`)

const times = [], rows = [], reloads = []
const startYear = l.year
let steps = 0, fails = 0, turned = false, crashDone = false
while (steps < 400) {
  const r = await get('/advance?n=1')
  if (r.status !== 200) { fails++; console.log('ERRO', r.status, r.text.slice(0, 300)); if (fails > 2) break; continue }
  const j = json(r)
  steps++
  times.push(r.ms)
  rows.push(j.save.rowsWritten)
  if (j.reloadedFromSql) console.log(`  avanço ${steps}: o objeto tinha reiniciado e recarregou do SQLite (boot ${j.boot})`)
  if (steps % 40 === 0) {
    const h = json(await get('/hash'))
    check(`avanço ${steps} (${j.date}): mundo em memória = mundo no SQLite`, h.same, h.memHash)
    const plain = await get('/reload?hash=0')
    reloads.push(plain.ms)
    const re = await get('/reload')
    const rj = json(re)
    check(`reinício simulado: recarrega e fica idêntico`, rj.hash === h.memHash, `só a carga (com rede): ${Math.round(plain.ms)} ms`)
  }
  if (steps === 90 && !crashDone) {
    crashDone = true
    const before = json(await get('/hash'))
    const crash = await get('/crash')
    // A plataforma efetiva o reinício logo depois da resposta: espera o contador `boot` subir.
    let after = json(await get('/info'))
    for (let k = 0; k < 10 && after.boot === before.boot; k++) {
      await new Promise((r) => setTimeout(r, 500))
      after = json(await get('/info'))
    }
    check('reinício REAL (ctx.abort): objeto novo, memória vazia', after.boot === before.boot + 1 && after.inMemory === false, `boot ${before.boot} → ${after.boot}, /crash respondeu ${crash.status}`)
    const re = await get('/hash')
    const rj = json(re)
    check('depois do reinício real, o mundo recarregado do SQLite é idêntico ao de antes', rj.reloadedFromSql === true && rj.memHash === before.memHash && rj.same, `${Math.round(re.ms)} ms (carga + comparação com o SQLite)`)
  }
  if (j.year !== startYear || j.turned > 0) { turned = true; console.log(`virou a temporada no avanço ${steps}: ${startYear} → ${j.year} (${j.date})`); break }
}
const final = json(await get('/hash'))
check('final: mundo em memória = mundo no SQLite', final.same)
console.log(`\navanços ${steps} | tempo por avanço (cliente, com rede): mediana ${q(times, .5).toFixed(0)} ms, p95 ${q(times, .95).toFixed(0)} ms, máximo ${Math.max(...times).toFixed(0)} ms`)
console.log(`linhas gravadas: total ${sum(rows)} | mediana ${q(rows, .5)}, p95 ${q(rows, .95)}, máximo ${Math.max(...rows)}`)
if (reloads.length) console.log(`/reload (recarregar do SQLite e medir): ${reloads.map((x) => Math.round(x)).join(', ')} ms`)
console.log('info', (await get('/info')).text)
check('a temporada virou', turned)
process.exit(bad === 0 ? 0 : 1)
