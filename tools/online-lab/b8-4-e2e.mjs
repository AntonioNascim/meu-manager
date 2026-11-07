// Teste de ponta a ponta da B8.4 (Pronto, Avançar, Pausa e horários), no navegador de verdade, contra o servidor LOCAL (wrangler dev --local, sem custo).
// Cada pessoa é um contexto do navegador. Uso (como o b8-3-e2e.mjs):
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-4-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-4'
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
  await page.getByTestId('age-18+').check()
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
const waitFor = async (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout })
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}

// ------------------------------------------------------------------ montar a liga com três técnicos
const ana = await person('Ana Treinadora')
const a = ana.page
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga Horarios ${rnd()}`)
await a.getByRole('button', { name: 'Resultado direto' }).click()
for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
await pickClub(a, 0)
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()

const join = async (nick, n) => {
  const p = await person(nick)
  await p.page.getByRole('button', { name: 'Ligas online' }).click()
  await p.page.getByRole('button', { name: 'Entrar com um código de convite' }).click()
  await p.page.getByTestId('invite-code').fill(code)
  await p.page.getByRole('button', { name: 'Procurar a liga' }).click()
  await pickClub(p.page, n)
  await p.page.getByTestId('members').getByText(nick).waitFor()
  return p
}
const bia = await join('Bia Craque', 1)
const cai = await join('Cai Zagueiro', 2)
const b = bia.page
check('três técnicos na liga', cai.page !== undefined)

await a.reload()
await a.getByTestId('online-account').waitFor()
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByText('Abrir a sala').first().click()
await a.getByTestId('start-league').click()
await a.getByTestId('status-next').waitFor({ timeout: 60000 })
check('liga iniciada: aparece a próxima rodada com data e hora', (await a.getByTestId('status-next').innerText()).toLowerCase().includes('próxima rodada'))
await shoot(a, '01-proxima-rodada-adm')

// ------------------------------------------------------------------ calendário e Pronto (Bia)
await b.getByRole('button', { name: 'Voltar' }).click()
await b.getByText('Abrir a sala').first().click()
await b.getByTestId('calendar').waitFor({ timeout: 30000 })
const items = await b.getByTestId('calendar').locator('li').count()
check('o calendário lista as próximas rodadas', items >= 1, `${items} rodadas`)
await shoot(b, '02-calendario-tecnico')
const hasReady = (await b.getByTestId('ready-button').count()) > 0
check('Bia vê o botão de Pronto (ou a nota de que não joga)', hasReady || (await b.getByTestId('not-playing').count()) > 0)
if (hasReady) {
  await b.getByTestId('ready-button').click()
  await b.getByText('Pronto! Toque para desfazer').waitFor()
  check('Bia deu Pronto: o botão muda', true)
  await shoot(b, '03-pronto-dado')
  await a.getByTestId('ready-list').waitFor()
  await waitFor(a, () => [...document.querySelectorAll('[data-testid=ready-list] li')].some((li) => li.textContent.includes('Bia') && li.textContent.includes('Pronto')), undefined, 30000)
  check('o ADM vê Bia como Pronto na lista', true)
  await shoot(a, '04-lista-quem-esta-pronto')
  await b.getByText('Pronto! Toque para desfazer').click()
  await b.getByText('Estou pronto').waitFor()
  check('desfazer o Pronto funciona', true)
}
check('o técnico comum não vê os controles do ADM', (await b.getByTestId('advance-league').count()) === 0 && (await b.getByTestId('pause-league').count()) === 0)

// ------------------------------------------------------------------ pausar e retomar
await a.getByTestId('pause-league').click()
await a.getByTestId('status-paused').waitFor({ timeout: 20000 })
await b.getByTestId('status-paused').waitFor({ timeout: 30000 })
check('a pausa aparece para todos', true)
await shoot(b, '05-liga-pausada-tecnico')
await shoot(a, '06-liga-pausada-adm')
check('em pausa o ADM vê Retomar e o Avançar some', (await a.getByTestId('resume-league').isVisible()) && (await a.getByTestId('advance-league').count()) === 0)
await a.getByTestId('resume-league').click()
await a.getByTestId('status-next').waitFor({ timeout: 20000 })
check('retomada: a próxima rodada volta', true)

// ------------------------------------------------------------------ ritmo
await a.getByTestId('change-pace').click()
await a.getByRole('dialog').waitFor()
await shoot(a, '07-escolher-ritmo')
const before = await a.getByTestId('calendar').innerText()
await a.getByTestId('pace-very-fast').click()
await waitFor(a, () => document.querySelector('[data-testid=change-pace]')?.textContent?.includes('Bem rápido'), undefined, 30000)
check('o ritmo mudou para Bem rápido e o botão mostra o ritmo', true)
const after = await a.getByTestId('calendar').innerText()
check('os horários do calendário foram refeitos', after !== before)

// ------------------------------------------------------------------ Avançar com confirmação
const nextBefore = await a.getByTestId('status-next').innerText()
await a.getByTestId('advance-league').click()
await a.getByRole('dialog').waitFor()
check('a confirmação mostra quem ainda não deu Pronto', (await a.getByTestId('advance-not-ready').count()) > 0 || (await a.getByText('Todos os técnicos com partida já deram Pronto').count()) > 0)
await shoot(a, '08-confirmar-avancar')
await a.getByTestId('confirm-advance').click()
await waitFor(a, (t) => document.querySelector('[data-testid=status-next]')?.textContent !== t, nextBefore, 30000)
check('Avançar fez a rodada acontecer (resultado direto) e a próxima mudou', true)
await waitFor(a, () => document.querySelector('[data-testid=league-log]')?.textContent?.includes('avançou'), undefined, 30000)
check('o registro mostra "ADM avançou a rodada"', true)
await shoot(a, '09-depois-de-avancar')

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
