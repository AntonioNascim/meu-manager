// Captura de 380 px da escolha de estilos na tela de Tática (Fase 6D).
import { chromium } from 'playwright'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://localhost:4173'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
const page = await ctx.newPage()
await page.goto(`${base}/?time=imp&semente=7&tela=tactics`)
await page.getByText('Lançamento direto').first().waitFor({ timeout: 60000 })
await page.getByText('Jogar pelas pontas').first().click()
await page.getByText('Jogar pelas pontas').first().scrollIntoViewIfNeeded()
await new Promise((r) => setTimeout(r, 600))
await page.screenshot({ path: resolve('../../.shots/d2-estilos-tatica.png') })
console.log('OK')
await browser.close()
