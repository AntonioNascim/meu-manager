// Teste de ponta a ponta da B8.7 ("Meu clube": renovar contratos e base), no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-7-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-7'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
const browser = await chromium.launch()

const person = async (nick) => {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [erro na página de ${nick}]`, e.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Criar minha conta online' }).click()
  await page.getByTestId('nickname-input').fill(nick)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByTestId('online-account').waitFor()
  return { context, page, nick }
}
const shoot = async (page, name, full = true) => {
  const dialog = (await page.getByRole('dialog').count()) > 0
  if (dialog) await sleep(700)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`), fullPage: full && !dialog })
}
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}

const ana = await person('Ana Treinadora')
const a = ana.page
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga Meu Clube ${rnd()}`)
await a.getByRole('button', { name: 'Resultado direto' }).click()
for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
await pickClub(a, 0)
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()
const bia = await person('Bia Craque')
const b = bia.page
await b.getByRole('button', { name: 'Ligas online' }).click()
await b.getByRole('button', { name: 'Entrar com um código de convite' }).click()
await b.getByTestId('invite-code').fill(code)
await b.getByRole('button', { name: 'Procurar a liga' }).click()
await pickClub(b, 1)
await b.getByTestId('members').getByText('Bia Craque').waitFor()

await a.reload()
await a.getByTestId('online-account').waitFor()
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByText('Abrir a sala').first().click()
await a.getByTestId('start-league').click()
await a.getByTestId('club-card').waitFor({ timeout: 60000 })

// ------------------------------------------------------------------ meta, contratos e base
check('"Meu clube" mostra a meta da diretoria', /terminar em \d+º/.test(await a.getByTestId('club-objective').innerText()))
const rows = await a.getByTestId('expiring-list').locator('li').count()
check('lista os contratos que vencem com a temporada', rows > 0, `${rows} jogadores`)
check('a base começa sem jovens de 20 anos esperando', (await a.getByTestId('no-youth').count()) === 1)
await shoot(a, '01-meu-clube')

// ------------------------------------------------------------------ renovar
const first = a.getByTestId('expiring-list').locator('li').first()
const nome = (await first.locator('span.font-semibold').first().innerText()).trim()
await first.getByRole('button', { name: 'Renovar' }).click()
await a.getByRole('dialog').waitFor()
check('a janela de renovação mostra o salário que ele pede', (await a.getByRole('dialog').innerText()).includes('pede'))
await shoot(a, '02-renovar-contrato')
await a.getByRole('dialog').getByRole('button', { name: '3 anos' }).click()
await a.getByTestId('confirm-renew').click()
await a.getByRole('dialog').waitFor({ state: 'detached', timeout: 20000 })
await a.waitForFunction((n) => ![...document.querySelectorAll('[data-testid=expiring-list] li')].some((li) => li.textContent.includes(n)), nome, { timeout: 20000 })
check('o jogador renovado sai da lista de contratos que vencem', true, nome)
await shoot(a, '03-depois-de-renovar')

// ------------------------------------------------------------------ a outra técnica só mexe no próprio clube
await b.getByRole('button', { name: 'Voltar' }).click()
await b.getByText('Abrir a sala').first().click()
await b.getByTestId('club-card').waitFor({ timeout: 30000 })
check('a Bia vê o clube dela (a renovação da Ana não mexeu nele)', (await b.getByTestId('expiring-list').locator('li').count()) > 0)
await shoot(b, '04-meu-clube-outra-tecnica')

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
