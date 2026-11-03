// Joga uma temporada no Worker publicado e mede tempo (do cliente) e gravação em SQLite. Uso: LAB_URL=... LABKEY_FILE=... node measure-cloud.mjs [save=1|0]
import { readFileSync } from 'node:fs'
const U = process.env.LAB_URL // endereço do Worker de laboratório publicado (ex.: https://lab-meumanager.<subdominio>.workers.dev)
const key = readFileSync(process.env.LABKEY_FILE, 'utf8').trim()
const save = process.argv[2] ?? '1'
const get = async (p) => {
  const t = performance.now()
  const r = await fetch(U + p, { headers: { 'x-lab-key': key } })
  const text = await r.text()
  return { ms: performance.now() - t, status: r.status, text }
}
const load = await get('/load')
console.log('load', Math.round(load.ms), 'ms', load.status)
const times = [], rows = [], changed = [], kb = []
let same = 0, last = '', steps = 0, fails = 0
const start = performance.now()
while (steps < 400) {
  const r = await get(`/advance?n=1&save=${save}`)
  if (r.status !== 200) { fails++; console.log('ERRO', r.status, r.text.slice(0, 300)); if (fails > 2) break; continue }
  const j = JSON.parse(r.text)
  steps++; if (steps % 20 === 0 || steps > 138) console.log(steps, j.date, 'finished', j.finished, Math.round(r.ms) + 'ms')
  times.push(r.ms)
  if (j.persist) { rows.push(j.persist.rowsWritten); changed.push(j.persist.changed); kb.push(j.persist.bytes / 1024) }
  const sig = j.date + '|' + j.finished
  same = sig === last ? same + 1 : 0
  last = sig
  if (j.dismissed || same >= 5) { console.log('fim:', j.date, 'finished', j.finished, j.dismissed ? 'DEMITIDO' : ''); break }
  if (j.year !== 2026) { console.log('virou o ano', j.year); break }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const sum = (a) => a.reduce((x, y) => x + y, 0)
console.log(`avancos ${steps} total ${((performance.now() - start) / 1000).toFixed(1)}s | por avanco ms: mediana ${q(times, .5).toFixed(0)} p95 ${q(times, .95).toFixed(0)} max ${Math.max(...times).toFixed(0)}`)
if (rows.length) console.log(`SQLite: linhas gravadas total ${sum(rows)} | por avanco mediana ${q(rows, .5)} p95 ${q(rows, .95)} max ${Math.max(...rows)} | blocos mudados mediana ${q(changed, .5)} max ${Math.max(...changed)} | KB por avanco mediana ${q(kb, .5).toFixed(0)} max ${Math.max(...kb).toFixed(0)} | total ${(sum(kb) / 1024).toFixed(0)} MB`)
console.log('info', (await get('/info')).text)
