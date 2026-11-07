// Teste de ponta a ponta da faixa de idade e do modo protegido (menores), no navegador, contra o servidor LOCAL (sem custo).
//   cd server && npx wrangler d1 migrations apply meu-manager --local && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 4173 --strictPort
//   cd tools/online-lab && node b9-age-e2e.mjs [http://localhost:4173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const prefix = process.argv[3] ?? 'b9-age'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 380, height: 900 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Criar minha conta online' }).click()
  await page.getByTestId('create-account').waitFor()
  return page
}
const shoot = async (page, name) => {
  await sleep(400)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}

// ------------------------------------------------------------------ menos de 12 anos
const kid = await newPage()
check('o botão de criar começa desligado, sem faixa escolhida', await kid.getByRole('button', { name: 'Criar conta' }).isDisabled())
await kid.getByTestId('age-under12').check()
await kid.getByTestId('too-young').waitFor()
check('menos de 12 anos: aviso e nenhum campo de apelido nem botão liberado', (await kid.getByTestId('nickname-input').count()) === 0 && (await kid.getByRole('button', { name: 'Criar conta' }).isDisabled()))
await shoot(kid, '01-menos-de-12')

// ------------------------------------------------------------------ 12 a 15 anos: modo protegido
const teen = await newPage()
await teen.getByTestId('age-12-15').check()
await teen.getByTestId('protected-info').waitFor()
check('12 a 15 anos: explica o modo protegido e não pede apelido', (await teen.getByTestId('nickname-input').count()) === 0)
await shoot(teen, '02-protegido-criar')
await teen.getByRole('button', { name: 'Criar conta' }).click()
await teen.getByTestId('online-account').waitFor({ timeout: 30000 })
await shoot(teen, '03-protegido-conta')
await teen.getByRole('button', { name: 'Ligas online' }).click()
await teen.getByTestId('protected-note').waitFor()
check('no modo protegido não há "Procurar ligas abertas"', (await teen.getByRole('button', { name: 'Procurar ligas abertas' }).count()) === 0)
await shoot(teen, '04-protegido-ligas')
await teen.getByRole('button', { name: 'Criar uma liga' }).click()
await teen.getByTestId('league-name-select').waitFor()
check('no modo protegido o nome da liga vem de uma lista e a liga é só de amigos', (await teen.getByTestId('protected-friends').count()) === 1 && (await teen.getByTestId('league-name').count()) === 0)
await shoot(teen, '05-protegido-criar-liga')
await teen.getByTestId('league-name-select').selectOption('Liga da Turma')
await teen.getByRole('button', { name: 'Criar a liga' }).click()
await teen.locator('text=Liga da Turma').first().waitFor({ timeout: 30000 })
check('a liga de amigos é criada', (await teen.locator('text=Liga da Turma').count()) > 0)
await shoot(teen, '06-protegido-liga-criada')
// Apelido gerado e fixo na tela de dados.
await teen.goto(base + '/?menu=dados')
await teen.getByTestId('account-nickname-fixed').waitFor({ timeout: 20000 })
const nick = await teen.getByTestId('account-nickname-fixed').innerText()
check('o apelido é o gerado pelo jogo (Técnico NNNN) e não há campo para trocar', /^Técnico \d{4}$/.test(nick.trim()) && (await teen.getByTestId('account-nickname').count()) === 0, nick.trim())
await shoot(teen, '07-protegido-dados')

// ------------------------------------------------------------------ 16 anos ou mais: tudo liberado
const adult = await newPage()
await adult.getByTestId('age-16-17').check()
await adult.getByTestId('nickname-input').waitFor()
check('16 ou 17 anos (limite atual): pede apelido e tem tudo liberado', (await adult.getByTestId('protected-info').count()) === 0)
await adult.getByTestId('nickname-input').fill('Craque Ana')
await adult.getByRole('button', { name: 'Criar conta' }).click()
await adult.getByTestId('online-account').waitFor({ timeout: 30000 })
await adult.getByRole('button', { name: 'Ligas online' }).click()
await adult.getByRole('button', { name: 'Procurar ligas abertas' }).waitFor()
await shoot(adult, '08-liberado-ligas')
check('quem tem a idade vê as ligas abertas', true)

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
