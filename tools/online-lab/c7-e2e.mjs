// Teste de ponta a ponta do painel do ADM e do Pronto antes da partida, no navegador, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c7-e2e.mjs [http://localhost:5173]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rnd = () => Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')
const browser = await chromium.launch()
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('  [erro na página]', e.message))
  return p
}
const account = async (page, nick) => {
  await page.goto(base)
  await page.getByRole('button', { name: 'Criar minha conta online' }).click()
  await page.getByTestId('age-18+').check()
  await page.getByTestId('nickname-input').fill(nick)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByTestId('online-account').waitFor()
}

// ------------------------------------------------------------------ o ADM cria a liga e abre o jogo do clube
const ana = await newPage()
await account(ana, 'Ana ADM')
await ana.getByRole('button', { name: 'Ligas online' }).click()
await ana.getByRole('button', { name: 'Criar uma liga' }).click()
await ana.getByTestId('league-name').fill(`Liga ADM ${rnd()}`)
await ana.getByRole('button', { name: 'Assistir ao vivo' }).click()
for (let i = 0; i < 5; i++) await ana.getByRole('button', { name: 'Menos' }).click()
await ana.getByRole('button', { name: 'Criar a liga' }).click()
await ana.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
await ana.getByTestId('pick-club').click()
await ana.getByTestId('club-list').waitFor({ timeout: 60000 })
await ana.locator('[data-testid^=club-team-]:not([disabled])').nth(0).click()
await ana.getByRole('button', { name: 'Assumir este clube' }).click()
await ana.getByTestId('members').getByText('Ana ADM').waitFor()
await ana.getByTestId('start-league').click()
await ana.getByTestId('open-league-game').click()
await ana.getByTestId('league-card').waitFor({ timeout: 90000 })

// ------------------------------------------------------------------ painel do ADM
await ana.getByRole('button', { name: /^ADM/ }).waitFor({ timeout: 30000 })
check('o botão ADM aparece nos atalhos do ADM', (await ana.getByRole('button', { name: /^ADM/ }).count()) === 1)
await ana.getByRole('button', { name: /^ADM/ }).click()
await ana.getByTestId('admin-panel').waitFor({ timeout: 30000 })
const info = await ana.getByTestId('admin-info').innerText()
const invite = (await ana.getByTestId('admin-invite-code').innerText()).replace(/\W/g, '')
check('mostra o código de convite, o ritmo e o jogo N/M', invite.length === 8 && /Rápido|Calmo|Normal|Muito/i.test(info) && /^jogo 1\/\d+$/.test((await ana.getByTestId('admin-progress').innerText()).trim()), (await ana.getByTestId('admin-progress').innerText()).trim())
check('lista os técnicos com a última vez', (await ana.getByTestId('last-seen').first().innerText()).length > 0)
await ana.screenshot({ path: resolve(shots, 'c7-painel-adm.png') })

// ------------------------------------------------------------------ código de vaga
await ana.getByTestId('vacancy-new').click()
await ana.getByTestId('club-list').waitFor({ timeout: 60000 })
await ana.locator('[data-testid^=club-team-]:not([disabled])').nth(5).click()
await ana.getByRole('button', { name: 'Assumir este clube' }).click()
await ana.getByTestId('vacancy-list').waitFor({ timeout: 30000 })
const vacancy = (await ana.getByTestId('vacancy-code').first().innerText()).replace(/\W/g, '')
check('o código de vaga é o convite + 4 símbolos', vacancy.length === 12 && vacancy.startsWith(invite), vacancy)

// Entrada fechada: só o código de vaga entra.
await ana.getByTestId('toggle-entry').click()
await ana.getByText('A entrada está fechada').waitFor({ timeout: 15000 })
const bia = await newPage()
await account(bia, 'Bia Técnica')
await bia.getByRole('button', { name: 'Ligas online' }).click()
await bia.getByRole('button', { name: /Entrar com um código/ }).click()
await bia.getByTestId('invite-code').fill(invite)
await bia.getByRole('button', { name: 'Procurar a liga' }).click()
await bia.getByTestId('pick-club').waitFor({ timeout: 15000 }).then(() => check('o código de convite comum não entra com a entrada fechada', false), () => check('o código de convite comum não entra com a entrada fechada', true))
await bia.reload()
await bia.getByRole('button', { name: 'Ligas online' }).click()
await bia.getByRole('button', { name: /Entrar com um código/ }).click()
await bia.getByTestId('invite-code').fill(vacancy)
await bia.getByRole('button', { name: 'Procurar a liga' }).click()
await bia.getByTestId('reserved-club').waitFor({ timeout: 30000 })
check('o código de vaga mostra o clube reservado', true)
await bia.getByTestId('take-reserved').click()
await bia.getByTestId('members').getByText('Bia Técnica').waitFor({ timeout: 30000 })
check('quem usa o código vira técnico direto no clube reservado', true)

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
