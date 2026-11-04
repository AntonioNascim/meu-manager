// Teto de memória da B5: segura N MB de lastro no heap, carrega o mundo real, joga a temporada gravando no SQLite e, no meio, recarrega tudo do SQLite
// (o pico de memória da recarga é o momento mais pesado). Uso: node ceiling-b5.mjs <mb>
import { readFileSync } from 'node:fs'
const U = process.env.LAB_URL
const key = readFileSync(process.env.LABKEY_FILE, 'utf8').trim()
const mb = process.argv[2] ?? '0'
const get = async (p) => {
  try {
    const r = await fetch(U + p, { headers: { 'x-lab-key': key }, signal: AbortSignal.timeout(120000) })
    return { status: r.status, text: await r.text() }
  } catch (e) { return { status: 0, text: String(e) } }
}
await get('/wipe')
const b = await get(`/ballast?mb=${mb}`)
if (b.status !== 200) { console.log(`lastro ${mb} MB: falhou ao reservar`, b.status, b.text.slice(0, 200)); process.exit() }
const l = await get('/load')
if (l.status !== 200) { console.log(`lastro ${mb} MB: falhou no load`, l.status, l.text.slice(0, 300).replace(/\s+/g, ' ')); process.exit() }
let steps = 0, result = 'ok', reloads = 0, boots = new Set()
while (steps < 300) {
  const r = await get('/advance?n=1')
  if (r.status !== 200) { result = `ERRO no avanço ${steps + 1}: ${r.status} ${r.text.slice(0, 200).replace(/\s+/g, ' ')}`; break }
  steps++
  const j = JSON.parse(r.text)
  boots.add(j.boot)
  if (steps === 60 || steps === 120) {
    const re = await get('/reload')
    if (re.status !== 200) { result = `ERRO na recarga (${steps}): ${re.status} ${re.text.slice(0, 200).replace(/\s+/g, ' ')}`; break }
    reloads++
  }
  if (j.year !== 2026 || j.turned > 0) break
}
const i = JSON.parse((await get('/info')).text || '{}')
console.log(`lastro ${mb} MB: ${result} | avanços ${steps} | recargas do SQLite ${reloads} | data ${i.date ?? '-'} | boots vistos ${[...boots].join(',')} | lastro ainda lá: ${i.ballastMB ?? 0} MB`)
