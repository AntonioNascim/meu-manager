// Capturas de 380 px do campo 2D por estilo (Fase 6D, parte 2): o mesmo lance do mesmo jogo em posse, contra-ataque e pressão alta.
//   VITE_API_BASE=http://127.0.0.1:8787 npx vite --port 4173 --strictPort    (jogo solo, sem servidor)
//   cd tools/online-lab && node d1-campo-shots.mjs [http://localhost:4173]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const shots = resolve('../../.shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const styles = [
  ['possession', 'posse', 'Posse de bola'],
  ['counter-attack', 'contra-ataque', 'Contra-ataque'],
  ['high-press', 'pressao-alta', 'Pressão alta'],
]
for (const [style, name, label] of styles) {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
  await page.goto(`${base}/?time=imp&semente=7&jogo=1&minuto=34&anim=1`)
  await page.getByTestId('shortcuts').waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: 'Ir para a partida' }).click()
  await page.getByTestId('speed').waitFor({ timeout: 60000 })
  await page.addStyleTag({ content: 'header{display:none !important}' })
  await page.getByRole('button', { name: 'Tática', exact: true }).first().click()
  await page.getByRole('button', { name: label, exact: true }).first().click()
  await sleep(800)
  await sleep(1500)
  await page.getByTestId('pitch').first().scrollIntoViewIfNeeded()
  await page.getByTestId('pitch').first().screenshot({ path: resolve(shots, `d1-campo-${name}.png`) })
  console.log('OK', name)
  await ctx.close()
}
await browser.close()
