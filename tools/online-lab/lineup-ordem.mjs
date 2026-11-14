// Captura da aba Elenco > Time principal em 380 px (ordem: campo, estilo e mentalidade, adversário, banco).
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node lineup-ordem.mjs [--url=http://localhost:4173]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const base = (process.argv.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:4173').slice(6)
const out = resolve('../../.shots')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 800 }, deviceScaleFactor: 2, locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('[erro]', e.message))
await page.goto(`${base}/?time=imp&semente=7&tela=squad&aba=lineup`)
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: resolve(out, 'lineup-ordem-380.png'), fullPage: true })
await browser.close()
console.log('ok')
