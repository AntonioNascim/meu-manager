// Escanteio no campo 2D: a bola vai ao canto e a cobrança é um cruzamento para a área. Um vigia dentro da página olha a posição da bola a cada quadro e,
// quando ela chega a um canto do campo, o script grava uma rajada de capturas.
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node e5-escanteio.mjs [http://localhost:4173]
import { chromium } from 'playwright'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://localhost:4173'
const shots = resolve('../../.shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
const page = await ctx.newPage()
await page.addInitScript(() => {
  window.__corner = 0
  const tick = () => {
    const ball = document.querySelector('[aria-label="Bola"]')
    const field = document.querySelector('[data-testid="pitch"] > div')
    if (ball && field) {
      const b = ball.getBoundingClientRect()
      const f = field.getBoundingClientRect()
      const x = (b.left + b.width / 2 - f.left) / f.width
      const y = (b.top + b.height / 2 - f.top) / f.height
      const inCorner = (x < 0.05 || x > 0.95) && (y < 0.07 || y > 0.93)
      window.__corner = inCorner ? window.__corner + 1 : 0
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
await page.goto(`${base}/?time=imp&semente=7&jogo=1&minuto=1&tela=match&iniciar=1`)
await page.getByTestId('pitch').waitFor({ timeout: 90000 })
const found = await page.waitForFunction(() => window.__corner >= 3, null, { timeout: 240000, polling: 50 }).then(() => true, () => false)
console.log(found ? 'bola no canto: escanteio' : 'não apareceu escanteio neste trecho')
if (found) {
  for (let k = 0; k < 9; k++) {
    await page.getByTestId('pitch').screenshot({ path: resolve(shots, `f1-escanteio-cena-${k}.png`) })
    await sleep(160)
  }
}
await browser.close()
process.exit(found ? 0 : 1)
