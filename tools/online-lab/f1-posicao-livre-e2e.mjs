// Posicionamento livre no navegador (solo): arrasta um titular para um ponto qualquer do campo e confere que ele fica onde foi solto,
// que o cartão mostra o papel entendido e que a escalação sobrevive a fechar e abrir a tela.
//   VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node f1-posicao-livre-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
// Capturas de 380 px em .shots/.
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'f1'
const shots = resolve('../../.shots')
let failed = 0
// As falhas também saem num resumo no fim do log (para copiar só o que importa).
const failures = []
process.on('exit', () => {
  if (failures.length > 0) console.log(`\nRESUMO DAS FALHAS (${failures.length}):\n${failures.join('\n')}`)
})
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) {
    failed++
    failures.push(`FALHA ${name}${extra ? '  ' + extra : ''}`)
  }
}
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${base}/?time=imp&semente=7&tela=squad&aba=lineup`, { waitUntil: 'domcontentloaded', timeout: 120000 })
const field = page.locator('[data-testid="grid-pitch"]').first()
await field.waitFor({ timeout: 20000 })
await field.evaluate((el) => el.scrollIntoView({ block: 'start' }))
await page.evaluate(() => window.scrollBy(0, -70))
await page.waitForTimeout(300)
const box = await field.boundingBox()
const tokens = page.locator('[data-player]')
check('11 titulares no campo', (await tokens.count()) === 11)

// pega um jogador de linha (o 6º) e o arrasta para um ponto livre no meio do campo
const token = tokens.nth(5)
const id = await token.getAttribute('data-player')
const from = await token.boundingBox()
const target = { x: box.x + box.width * 0.41, y: box.y + box.height * 0.385 }
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
await page.mouse.down()
await page.mouse.move(target.x, target.y, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(400)

const after = await page.locator(`[data-player="${id}"]`).boundingBox()
const cx = after.x + after.width / 2
const cy = after.y + after.height / 2
check('o jogador fica onde foi solto (x)', Math.abs(cx - target.x) < 6, `${cx.toFixed(1)} vs ${target.x.toFixed(1)}`)
check('o jogador fica onde foi solto (y)', Math.abs(cy - target.y) < 6, `${cy.toFixed(1)} vs ${target.y.toFixed(1)}`)
check('o cartão do papel aparece', (await page.locator('[data-testid="role-card"]').innerText()).includes('O motor entende'))
await page.screenshot({ path: `${shots}/${prefix}-posicao-livre.png`, fullPage: false })

// sobrevive a trocar de aba e voltar
await page.goto(`${base}/?time=imp&semente=7&tela=squad&aba=lineup`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(500)
check('sem erros de JavaScript', errors.length === 0, errors.join(' | ').slice(0, 200))
await browser.close()
if (failed > 0) process.exit(1)
