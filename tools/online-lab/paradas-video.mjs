// Jogadas paradas no campo 2D (tiro de meta, saída de bola depois do gol, escanteio, pênalti): grava um vídeo curto e uma captura de cada cena em .shots/.
// Um vigia dentro da página lê a linha de narração do campo; quando aparece o texto de uma cena, o script tira a captura.
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node paradas-video.mjs [http://localhost:4173] [segundos máximos]
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const maxSeconds = Number(process.argv[3] ?? 150)
const shots = resolve('../../.shots')
const tmp = resolve(shots, 'paradas-tmp')
mkdirSync(tmp, { recursive: true })
const SCENES = {
  'tiro-de-meta': /tiro de meta/i,
  'saida-de-bola': /sa[ií]da de bola|volta ao meio/i,
  escanteio: /escanteio|canto/i,
  penalti: /p[eê]nalti/i,
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR', recordVideo: { dir: tmp, size: { width: 380, height: 844 } } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[erro]', e.message))
await page.goto(`${base}/?time=imp&semente=7&jogo=1&minuto=1&tela=match&iniciar=1`)
await page.getByTestId('pitch').waitFor({ timeout: 90000 })
const seen = new Set()
const t0 = Date.now()
while ((Date.now() - t0) / 1000 < maxSeconds && seen.size < 2) {
  const text = (await page.getByTestId('pitch-line').textContent().catch(() => '')) ?? ''
  for (const [name, re] of Object.entries(SCENES)) {
    if (!seen.has(name) && re.test(text)) {
      seen.add(name)
      console.log(`cena: ${name} — "${text}"`)
      // uma pequena sequência, para ver os jogadores se posicionando
      for (let k = 0; k < 4; k++) {
        await page.getByTestId('pitch').screenshot({ path: resolve(shots, `paradas-${name}-${k}.png`) })
        await sleep(450)
      }
    }
  }
  await sleep(120)
}
console.log('cenas vistas:', [...seen].join(', ') || 'nenhuma')
await page.close()
await ctx.close()
await browser.close()
const video = readdirSync(tmp).find((f) => f.endsWith('.webm'))
if (video) renameSync(resolve(tmp, video), resolve(shots, 'paradas-video.webm'))
process.exit(seen.size > 0 ? 0 : 1)
