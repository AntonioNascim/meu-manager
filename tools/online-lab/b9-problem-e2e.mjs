// Teste de ponta a ponta do "Relatar problema" e do painel de uso (teste fechado), no navegador, contra o servidor LOCAL (sem custo).
//   server/.dev.vars com ADMIN_TOKEN=local-admin-secret-0123456789abcdef; wrangler d1 migrations apply meu-manager --local
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 4173 --strictPort
//   cd tools/online-lab && node b9-problem-e2e.mjs [http://localhost:4173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const prefix = process.argv[3] ?? 'b9-problem'
const API = 'http://127.0.0.1:8787'
const TOKEN = 'local-admin-secret-0123456789abcdef'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const admin = async (path, body) => {
  const r = await fetch(`${API}/admin/api/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
await page.goto(base)
await page.getByTestId('report-problem').waitFor({ timeout: 30000 })
await page.getByTestId('report-problem').click()
await page.getByTestId('problem-text').waitFor()
check('o botão fica desligado até a descrição ter o mínimo', await page.getByTestId('problem-send').isDisabled())
await page.getByTestId('problem-category').selectOption('match')
await page.getByTestId('problem-text').fill('Na partida ao vivo, depois de uma lesão o jogo parou e não voltou.\nUsei o Chrome no celular.')
// Uma imagem de verdade (PNG pequeno desenhado no navegador) para o redimensionamento e o envio.
const png = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 800
  const g = c.getContext('2d')
  g.fillStyle = '#123'
  g.fillRect(0, 0, 1200, 800)
  g.fillStyle = '#9f0'
  g.fillRect(100, 100, 400, 300)
  return c.toDataURL('image/png').split(',')[1]
})
await page.getByTestId('problem-file').setInputFiles({ name: 'tela.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
await page.getByAltText('Imagem da tela que será enviada').waitFor({ timeout: 10000 })
check('a imagem é reduzida e mostrada antes de enviar', true)
await page.getByText('Ver o que será enviado').click()
const tech = await page.getByTestId('problem-tech').innerText()
check('as informações técnicas aparecem para a pessoa conferir', tech.includes('screen: menu') && tech.includes('browser:') && !/playerId|nickname|apelido/i.test(tech), tech.split('\n').slice(0, 4).join(' | '))
await page.screenshot({ path: resolve(shots, `${prefix}-01-formulario.png`) })
await page.getByTestId('problem-send').click()
await page.getByTestId('problem-done').waitFor({ timeout: 15000 })
check('o relato é enviado e a tela agradece', true)
await page.screenshot({ path: resolve(shots, `${prefix}-02-enviado.png`) })

// ------------------------------------------------------------------ o painel
const list = await admin('problems?status=open')
check('o relato aparece no painel', list.json.problems?.length === 1 && list.json.problems[0].category === 'match' && list.json.problems[0].hasImage, JSON.stringify(list.json.problems?.[0]?.text?.slice(0, 40)))
const one = await admin(`problem?id=${list.json.problems[0].id}`)
check('o detalhe traz a imagem JPEG e as informações técnicas', one.json.image?.startsWith('data:image/jpeg;base64,') && one.json.tech?.screen === 'menu', `${Math.round((one.json.image?.length ?? 0) / 1024)} KB`)
const usage = await admin('usage')
check('o painel de uso responde com ativos, estimativa e relatos', usage.status === 200 && usage.json.estimate?.usd >= 5 && usage.json.openProblems === 1, JSON.stringify(usage.json.estimate))

const ctx2 = await browser.newContext({ viewport: { width: 420, height: 1000 }, deviceScaleFactor: 2 })
const panel = await ctx2.newPage()
await panel.goto(`${API}/admin`)
await panel.locator('#token').fill(TOKEN)
await panel.locator('#enter').click()
await panel.locator('#app:not([hidden])').waitFor({ timeout: 10000 })
await panel.getByText('Na partida ao vivo').waitFor({ timeout: 10000 })
await panel.screenshot({ path: resolve(shots, `${prefix}-03-painel-uso.png`) })
await panel.getByRole('button', { name: 'Abrir' }).first().click()
await panel.locator('#pdetail img').waitFor({ timeout: 10000 })
check('o painel abre o relato com a imagem', true)
await panel.screenshot({ path: resolve(shots, `${prefix}-04-painel-relato.png`) })
await panel.getByRole('button', { name: 'Marcar como resolvido' }).click()
await panel.getByText('Feito.').waitFor({ timeout: 10000 })
check('marcar como resolvido tira dos abertos', (await admin('problems?status=open')).json.problems.length === 0 && (await admin('problems?status=done')).json.problems.length === 1)

// ------------------------------------------------------------------ limites
let blocked = 0
for (let i = 0; i < 8; i++) {
  const r = await fetch(`${API}/api/problem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: 'bug', text: 'teste de limite do envio' }) })
  if (r.status === 429) blocked++
}
check('o limite por IP segura quem manda relatos demais', blocked >= 1, `${blocked} bloqueados de 8`)
const huge = await fetch(`${API}/api/problem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(320000) })
check('corpo gigante é recusado', huge.status === 413 || huge.status === 429, `HTTP ${huge.status}`)

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
