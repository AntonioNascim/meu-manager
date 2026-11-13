// Partida em 380 px: barra de baixo escondida e placar fixo por cima do campo ao rolar.
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node e1-barra-placar.mjs [url] [rotulo]
import { chromium } from 'playwright'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://localhost:4173'
const tag = process.argv[3] ?? 'depois'
const shots = resolve('../../.shots')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[erro]', e.message))
await page.goto(`${base}/?time=imp&semente=7&jogo=1&minuto=34&anim=1`)
await page.getByTestId('shortcuts').waitFor({ timeout: 60000 })
await page.getByRole('button', { name: 'Ir para a partida' }).click()
await page.getByTestId('speed').waitFor({ timeout: 60000 })
await page.waitForTimeout(1500)
const nav = await page.locator('nav[aria-label="Navegação principal"]').count()
console.log('barra de baixo presente:', nav)
for (const y of [0, 260, 340, 420]) {
  await page.evaluate((v) => window.scrollTo(0, v), y)
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(shots, `e1-partida-${tag}-${y}.png`) })
}
await browser.close()
