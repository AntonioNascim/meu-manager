// Procura o teto de memória: segura N MB de lastro no heap, carrega o mundo e joga a temporada. Uso: node ceiling-cloud.mjs <mb> <save 0|1>
import { readFileSync } from 'node:fs'
const U = process.env.LAB_URL // endereço do Worker de laboratório publicado (ex.: https://lab-meumanager.<subdominio>.workers.dev)
const key = readFileSync(process.env.LABKEY_FILE, 'utf8').trim()
const [mb, save] = [process.argv[2] ?? '0', process.argv[3] ?? '0']
const get = async (p) => { const r = await fetch(U + p, { headers: { 'x-lab-key': key } }); return { status: r.status, text: await r.text() } }
await get('/wipe')
const b = await get(`/ballast?mb=${mb}`)
if (b.status !== 200) { console.log(`lastro ${mb} MB: falhou ao reservar`, b.status, b.text.slice(0, 200)); process.exit() }
const l = await get('/load')
if (l.status !== 200) { console.log(`lastro ${mb} MB: falhou no load`, l.status, l.text.slice(0, 300)); process.exit() }
let steps = 0, same = 0, last = '', result = 'ok'
while (steps < 300) {
  const r = await get(`/advance?n=1&save=${save}`)
  if (r.status !== 200) { result = `ERRO no avanço ${steps + 1}: ${r.status} ${r.text.slice(0, 160).replace(/\s+/g, ' ')}`; break }
  steps++
  const j = JSON.parse(r.text)
  const sig = j.date + '|' + j.finished
  same = sig === last ? same + 1 : 0; last = sig
  if (j.dismissed || same >= 5) break
}
const i = JSON.parse((await get('/info')).text)
console.log(`lastro ${mb} MB, save=${save}: ${result} | avanços ${steps} | data ${i.date ?? '-'} | lastro ainda lá: ${i.ballastMB ?? 0} MB`)
