// Vídeo curto do campo 2D para cada estilo de jogo (seu time joga com o estilo; mentalidade equilibrada), no navegador, um de cada vez.
//   VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node estilos-videos.mjs [http://localhost:5173] [segundos=16] [mentalidade=0] [estilo,estilo...]
// Grava em .shots/fluidez/estilo-<estilo>[-m<mentalidade>].webm (o time da casa é o Real Carioca, que ataca para a direita; a faixa no alto diz o estilo).
import { chromium } from 'playwright'
import { mkdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const seconds = Number(process.argv[3] ?? 16)
const mentality = Number(process.argv[4] ?? 0)
const styles = (process.argv[5] ?? 'possession,direct,counter-attack,wings,high-press').split(',')
const out = resolve('../../.shots/fluidez')
mkdirSync(out, { recursive: true })
const LABEL = { possession: 'Toque de bola', direct: 'Lançamento direto', 'counter-attack': 'Contra-ataque', wings: 'Jogar pelas pontas', 'high-press': 'Pressão total' }
const MENT = { '-2': 'muito defensiva', '-1': 'defensiva', 0: 'equilibrada', 1: 'ofensiva', 2: 'muito ofensiva' }

const browser = await chromium.launch()
for (const style of styles) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, recordVideo: { dir: out, size: { width: 420, height: 900 } }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
  await page.goto(`${base}/?time=rca&semente=7&jogo=1&tela=match&estilo=${style}&mentalidade=${mentality}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.getByTestId('pitch').waitFor({ timeout: 120000 })
  for (let i = 0; i < 4; i++) {
    if ((await page.getByTestId('speed').innerText()).trim().startsWith('1x')) break
    await page.getByTestId('speed').click()
  }
  await page.evaluate(([text]) => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#d4ff2e;color:#0b0f1a;font:700 15px sans-serif;padding:6px 10px;text-align:center'
    document.body.prepend(el)
  }, [`${LABEL[style]} · mentalidade ${MENT[mentality]}`])
  await page.getByRole('button', { name: /^Começar$/ }).first().click()
  await page.waitForTimeout(seconds * 1000)
  const video = page.video()
  await page.close()
  await ctx.close()
  const tag = `estilo-${style}${mentality === 0 ? '' : `-m${mentality}`}`
  if (video) renameSync(await video.path(), resolve(out, `${tag}.webm`))
  console.log('gravado', tag)
}
await browser.close()
