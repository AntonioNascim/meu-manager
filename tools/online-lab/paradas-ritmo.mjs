// Ritmo das jogadas paradas (saída de bola depois do gol, pênalti, tiro de meta): acha o minuto de cada cena e grava um vídeo curto no 1x e no 2x em .shots/ensaio-paradas/.
// Também imprime quanto tempo cada texto da narração ficou na tela (confere os tempos combinados).
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node paradas-ritmo.mjs [http://localhost:4173] [semente,semente,...]
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const seeds = (process.argv[3] ?? '7,3,11,5,9,13').split(',')
const out = resolve('../../.shots/ensaio-paradas')
const tmp = resolve(out, 'tmp')
mkdirSync(tmp, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SCENES = {
  gol: { start: /volta ao meio do campo e os times voltam/i, end: /d[aá] a sa[ií]da de bola/i },
  penalti: { start: /p[eê]nalti! os jogadores saem/i, end: /parte para a cobran[cç]a/i },
  'tiro-de-meta': { start: /tiro de meta\. os jogadores saem/i, end: /cobra o tiro de meta/i },
}
const browser = await chromium.launch()

// 1) Procura, em cada semente, o minuto em que cada cena começa (jogando a 2x).
const found = {}
for (const seed of seeds) {
  if (Object.keys(found).length === 3) break
  const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, locale: 'pt-BR' })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__log = []
    let last = ''
    const tick = () => {
      const line = document.querySelector('[data-testid="pitch-line"]')?.textContent ?? ''
      const clock = document.querySelector('[data-testid="match-clock"]')?.textContent ?? ''
      if (line !== last) {
        last = line
        window.__log.push({ line, minute: parseInt(clock.match(/\d+/)?.[0] ?? '0', 10) })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto(`${base}/?time=imp&semente=${seed}&jogo=1&minuto=1&tela=match&iniciar=1`)
  await page.getByTestId('pitch').waitFor({ timeout: 90000 })
  await page.getByTestId('speed').click()
  const t0 = Date.now()
  while (Date.now() - t0 < 200000 && Object.keys(found).length < 3) {
    const log = await page.evaluate(() => window.__log.splice(0))
    for (const e of log) for (const [name, re] of Object.entries(SCENES)) if (!found[name] && re.start.test(e.line)) found[name] = { seed, minute: e.minute }
    const text = (await page.getByTestId('match-clock').textContent().catch(() => '')) ?? ''
    if (/fim|encerr/i.test(text)) break
    await sleep(500)
  }
  console.log(`semente ${seed}:`, JSON.stringify(found))
  await ctx.close()
}

// 2) Grava cada cena no 1x e no 2x e mede o tempo de cada texto.
const rows = []
for (const [name, where] of Object.entries(found)) {
  for (const speed of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 380, height: 560 }, locale: 'pt-BR', recordVideo: { dir: tmp, size: { width: 380, height: 560 } } })
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      window.__log = []
      let last = ''
      const tick = () => {
        const line = document.querySelector('[data-testid="pitch-line"]')?.textContent ?? ''
        if (line !== last) {
          last = line
          window.__log.push({ line, t: performance.now() })
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto(`${base}/?time=imp&semente=${where.seed}&jogo=1&minuto=${Math.max(1, where.minute - 1)}&tela=match&iniciar=1`)
    await page.getByTestId('pitch').waitFor({ timeout: 90000 })
    if (speed === 2) await page.getByTestId('speed').click()
    const re = SCENES[name]
    const t0 = Date.now()
    let done = false
    while (Date.now() - t0 < 60000 && !done) {
      const log = await page.evaluate(() => window.__log)
      const i = log.findIndex((e) => re.end.test(e.line))
      if (i >= 0 && log[i + 1]) done = true
      else await sleep(300)
    }
    await sleep(2500)
    const log = await page.evaluate(() => window.__log)
    const s = log.findIndex((e) => re.start.test(e.line))
    const e = log.findIndex((x) => re.end.test(x.line))
    const steps = log.slice(Math.max(0, s), e + 2).map((x, i, a) => `${x.line} (${a[i + 1] ? ((a[i + 1].t - x.t) / 1000).toFixed(1) : '…'}s)`)
    rows.push({ name, speed, steps })
    await page.close()
    await ctx.close()
    const video = readdirSync(tmp).find((f) => f.endsWith('.webm'))
    if (video) renameSync(resolve(tmp, video), resolve(out, `${name}-${speed}x.webm`))
  }
}
await browser.close()
rmSync(tmp, { recursive: true, force: true })
for (const r of rows) console.log(`\n== ${r.name} ${r.speed}x\n  ${r.steps.join('\n  ')}`)
console.log('\nencontradas:', Object.keys(found).join(', '), '| faltando:', Object.keys(SCENES).filter((k) => !found[k]).join(', ') || 'nenhuma')
