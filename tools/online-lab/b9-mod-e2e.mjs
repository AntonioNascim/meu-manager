// Teste de ponta a ponta da moderação da B9 (denunciar, apelido tirado, liga escondida, painel e banimento), no navegador, contra o servidor LOCAL (sem custo).
//   server/.dev.vars precisa de ADMIN_TOKEN=local-admin-secret-0123456789abcdef; aplicar a migração: wrangler d1 migrations apply meu-manager --local
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 4173 --strictPort
//   cd tools/online-lab && node b9-mod-e2e.mjs [http://localhost:4173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const prefix = process.argv[3] ?? 'b9-mod'
const API = 'http://127.0.0.1:8787'
const TOKEN = 'local-admin-secret-0123456789abcdef'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
const browser = await chromium.launch()
const admin = async (path, body) => {
  const r = await fetch(`${API}/admin/api/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}

const person = async (nick) => {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [erro na página de ${nick}]`, e.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Criar minha conta online' }).click()
  await page.getByTestId('age-18+').check()
  await page.getByTestId('nickname-input').fill(nick)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByTestId('online-account').waitFor()
  return { context, page, nick }
}
const shoot = async (page, name) => {
  await sleep(500)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}

// ------------------------------------------------------------------ o painel só existe com o segredo
const noAuth = await admin('overview').then(() => fetch(`${API}/admin/api/overview`)).then((r) => r.status)
check('o painel recusa quem não manda o segredo', noAuth === 401, `HTTP ${noAuth}`)
const wrong = await fetch(`${API}/admin/api/overview`, { headers: { Authorization: 'Bearer errado-errado-errado' } }).then((r) => r.status)
check('e quem manda o segredo errado', wrong === 401)

// ------------------------------------------------------------------ liga com quatro técnicos
const ana = await person('Ana Treinadora')
const a = ana.page
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga Denuncia ${rnd()}`)
await a.getByRole('button', { name: 'Resultado direto' }).click()
for (let i = 0; i < 4; i++) await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
await pickClub(a, 8)
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()
const others = []
for (const [i, nick] of ['Bia Craque', 'Cris Zagueira', 'Dani Meia'].entries()) {
  const p = await person(nick)
  await p.page.getByRole('button', { name: 'Ligas online' }).click()
  await p.page.getByRole('button', { name: 'Entrar com um código de convite' }).click()
  await p.page.getByTestId('invite-code').fill(code)
  await p.page.getByRole('button', { name: 'Procurar a liga' }).click()
  await pickClub(p.page, 9 + i)
  await p.page.getByTestId('members').getByText(nick).waitFor()
  others.push(p)
}
check('quatro técnicos na liga', true)

// ------------------------------------------------------------------ denunciar o apelido da Ana
const b = others[0].page
await b.reload()
await b.getByRole('button', { name: 'Ligas online' }).click()
await b.getByText('Abrir a sala').first().click()
await b.getByTestId('members').waitFor()
check('não há botão de denunciar no próprio nome', (await b.getByTestId('report-Bia Craque').count()) === 0)
await b.getByTestId('report-Ana Treinadora').click()
await b.getByTestId('report-send').waitFor()
await shoot(b, '01-denunciar-apelido')
await b.getByTestId('report-send').click()
await b.getByTestId('report-done').waitFor({ timeout: 10000 })
check('a denúncia é enviada e a tela agradece', true)
await shoot(b, '02-denuncia-enviada')
await b.getByTestId('report-close').click()
await b.getByTestId('report-Ana Treinadora').click()
await b.getByTestId('report-send').click()
await b.getByText('Você já denunciou isto').waitFor({ timeout: 10000 })
check('denunciar o mesmo apelido de novo é recusado', true)
await b.keyboard.press('Escape')

for (const p of others.slice(1)) {
  await p.page.reload()
  await p.page.getByRole('button', { name: 'Ligas online' }).click()
  await p.page.getByText('Abrir a sala').first().click()
  await p.page.getByTestId('members').waitFor()
  await p.page.getByTestId('report-Ana Treinadora').click()
  await p.page.getByTestId('report-send').click()
  await p.page.getByTestId('report-done').waitFor({ timeout: 10000 })
}
await a.reload()
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByText('Abrir a sala').first().click()
await a.getByTestId('members').waitFor()
const members = await a.getByTestId('members').innerText()
check('3 pessoas diferentes tiram o apelido: volta a "Técnico NNNN"', /Técnico \d{4}/.test(members) && !members.includes('Ana Treinadora'), members.split('\n').slice(0, 3).join(' | '))
await shoot(a, '03-apelido-tirado')

// ------------------------------------------------------------------ denunciar a liga: 3 membros escondem do diretório
const leagueId = (await admin('overview')).json
for (const p of others) {
  await p.page.reload()
  await p.page.getByRole('button', { name: 'Ligas online' }).click()
  await p.page.getByText('Abrir a sala').first().click()
  await p.page.getByTestId('report-league').click()
  await p.page.getByTestId('report-send').click()
  await p.page.getByTestId('report-done').waitFor({ timeout: 10000 })
}
const hidden = await admin('hidden-leagues')
check('3 denúncias escondem a liga do diretório até o painel olhar', hidden.json.leagues?.length === 1, JSON.stringify(hidden.json.leagues?.map((l) => l.name)))
void leagueId

// ------------------------------------------------------------------ o painel
const panelCtx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
const panel = await panelCtx.newPage()
panel.on('pageerror', (e) => console.log('  [erro no painel]', e.message))
await panel.goto(`${API}/admin`)
await panel.locator('#token').fill('errado-errado-errado-errado')
await panel.locator('#enter').click()
await panel.getByText('Segredo incorreto').waitFor({ timeout: 10000 })
check('o painel recusa o segredo errado', true)
await panel.locator('#token').fill(TOKEN)
await panel.locator('#enter').click()
await panel.locator('#app:not([hidden])').waitFor({ timeout: 10000 })
await panel.getByText('Liga Denuncia').first().waitFor({ timeout: 10000 })
check('o painel lista a liga escondida', true)
await shoot(panel, '04-painel')

// Banir a Ana pelo painel: o próximo pedido dela dá 403 e ela sai da liga.
const anaId = (await a.evaluate(() => indexedDB.databases?.().then((d) => d.map((x) => x.name)))) ?? []
void anaId
const overview = await admin('overview')
check('o painel mostra os números', overview.json.identities >= 4 && overview.json.hiddenLeagues === 1, JSON.stringify(overview.json))
// O playerId da Ana vem da denúncia aberta? O apelido já foi tirado (denúncias atendidas): pegamos pelo painel de ligas escondidas -> sala -> membros.
const reports = await admin('reports?status=actioned')
const target = reports.json.groups?.find((g) => g.kind === 'nickname')?.target
check('a denúncia atendida do apelido aparece no painel', !!target, target ?? '')
if (target) {
  const ban = await admin('action', { type: 'ban', playerId: target, reason: 'teste do painel' })
  check('banir pelo painel', ban.status === 200)
  await a.reload()
  await sleep(1500)
  const txt = (await a.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('  [tela da Ana depois do banimento]', txt.slice(0, 160))
  const after = await admin('bans')
  check('a lista de banidos mostra a Ana', after.json.bans?.some((x) => x.playerId === target))
  const un = await admin('action', { type: 'unban', playerId: target })
  check('desbanir devolve a conta', un.status === 200)
}
const hid = hidden.json.leagues?.[0]?.id
if (hid) {
  const show = await admin('action', { type: 'show-league', leagueId: hid })
  check('o painel mostra a liga de novo', show.status === 200 && (await admin('hidden-leagues')).json.leagues.length === 0)
}
const bad = await admin('action', { type: 'apagar-tudo' })
check('ação desconhecida é recusada', bad.status === 400)

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
