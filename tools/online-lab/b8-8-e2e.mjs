// Teste de ponta a ponta da B8.8 (copas na liga online e aviso de privacidade), no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-8-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-8'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
const browser = await chromium.launch()
const shoot = async (page, name, full = true) => {
  const dialog = (await page.getByRole('dialog').count()) > 0
  if (dialog) await sleep(700)
  await sleep(200)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`), fullPage: full && !dialog })
}

const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
  await page.goto(base)
  return page
}

// ------------------------------------------------------------------ aviso de privacidade (antes de criar a conta e depois, pela conta)
const a = await newPage()
await a.getByRole('button', { name: 'Criar minha conta online' }).click()
await a.getByTestId('open-privacy').click()
await a.getByTestId('privacy-notice').waitFor()
const text = (await a.getByTestId('privacy-notice').innerText()).toLowerCase()
check('o aviso de privacidade abre antes de criar a conta e fala do IP, do código e dos direitos', text.includes('endereço de ip') && text.includes('código de recuperação') && text.includes('seus direitos') && text.includes('24 horas'))
await shoot(a, '01-aviso-de-privacidade')
await a.getByTestId('privacy-back').click()
await a.getByTestId('create-account').waitFor()
check('voltar do aviso leva de volta à criação da conta', true)
await a.getByTestId('age-18+').check()
await a.getByTestId('nickname-input').fill('Ana Treinadora')
await a.getByRole('button', { name: 'Criar conta' }).click()
await a.getByTestId('online-account').waitFor()

// ------------------------------------------------------------------ liga com copas: dois técnicos, resultado direto
const person = async (nick) => {
  const page = await newPage()
  await page.getByRole('button', { name: 'Criar minha conta online' }).click()
  await page.getByTestId('age-18+').check()
  await page.getByTestId('nickname-input').fill(nick)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByTestId('online-account').waitFor()
  return page
}
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga Copas ${rnd()}`)
await a.getByRole('button', { name: 'Resultado direto' }).click()
for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
await pickClub(a, 0)
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()
const b = await person('Bia Craque')
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
await a.getByTestId('cups-card').waitFor({ timeout: 60000 })
check('a sala mostra o cartão "Copas" (caminho do clube, outras copas e campeões)', true)
check('a próxima rodada lista os jogos dos técnicos com a competição e a fase', /rodada|copa|supercopa/i.test(await a.getByTestId('fixtures').innerText()))
await shoot(a, '02-sala-com-copas')

// ------------------------------------------------------------------ o ADM avança até aparecer uma rodada de copa
let cupSeen = false
for (let i = 0; i < 14 && !cupSeen; i++) {
  const text = (await a.getByTestId('fixtures').innerText().catch(() => '')) + (await a.getByTestId('calendar').innerText().catch(() => ''))
  cupSeen = /Copa/.test(text)
  if (cupSeen) break
  await a.getByTestId('advance-league').click()
  await a.getByTestId('confirm-advance').click()
  await sleep(2500)
}
check('uma data de copa aparece no calendário/na próxima rodada', cupSeen)
if (cupSeen) {
  await a.getByTestId('calendar').scrollIntoViewIfNeeded()
  check('o calendário marca a competição das datas com copa', (await a.getByTestId('calendar-competitions').allInnerTexts()).some((t) => /Copa/.test(t)))
  await shoot(a, '03-calendario-com-copa')
  // joga rodadas até a Ana ter um jogo de copa e vê o caminho dela
  for (let i = 0; i < 6; i++) {
    const fx = await a.getByTestId('fixtures').innerText().catch(() => '')
    if (/Copa/.test(fx)) {
      await a.getByTestId('advance-league').click()
      await a.getByTestId('confirm-advance').click()
      await sleep(2500)
      break
    }
    await a.getByTestId('advance-league').click()
    await a.getByTestId('confirm-advance').click()
    await sleep(2500)
  }
  await a.reload()
  await a.getByTestId('online-account').waitFor()
  await a.getByRole('button', { name: 'Ligas online' }).click()
  await a.getByText('Abrir a sala').first().click()
  await a.getByTestId('cups-card').waitFor({ timeout: 30000 })
  const cupsText = (await a.getByTestId('cups-card').innerText()).replace(/\s+/g, ' ')
  check('o cartão de copas mostra o caminho do clube ou diz que ele não está em copa', /Copa|Seu clube não está/.test(cupsText), cupsText.slice(0, 120))
  await shoot(a, '04-copas-caminho')
}

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
