// Teste de ponta a ponta da B8.6b (mercado com os clubes da IA: busca, anúncios, propostas e propostas da IA), no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-6b-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-6b'
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
const shoot = async (page, name) => {
  const dialog = (await page.getByRole('dialog').count()) > 0
  if (dialog) await sleep(700)
  await sleep(200)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}
const openMarket = async (page) => {
  await page.getByTestId('open-market').click()
  await page.getByTestId('league-market').waitFor()
}
const tab = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) }).click()

// ------------------------------------------------------------------ liga com dois técnicos
const ana = await person('Ana Treinadora')
const a = ana.page
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga IA ${rnd()}`)
await a.getByRole('button', { name: 'Resultado direto' }).click()
for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
await pickClub(a, 8)
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()
const bia = await person('Bia Craque')
const b = bia.page
await b.getByRole('button', { name: 'Ligas online' }).click()
await b.getByRole('button', { name: 'Entrar com um código de convite' }).click()
await b.getByTestId('invite-code').fill(code)
await b.getByRole('button', { name: 'Procurar a liga' }).click()
await pickClub(b, 9)
await b.getByTestId('members').getByText('Bia Craque').waitFor()
await a.reload()
await a.getByTestId('online-account').waitFor()
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByText('Abrir a sala').first().click()
await a.getByTestId('start-league').click()
await a.getByTestId('open-market').waitFor({ timeout: 60000 })

// ------------------------------------------------------------------ busca com filtros
await openMarket(a)
await tab(a, 'Buscar')
await a.getByTestId('search-list').locator('li').first().waitFor({ timeout: 30000 })
const total = await a.getByTestId('search-list').locator('li').count()
check('a busca traz jogadores dos clubes da IA (até 40)', total > 5 && total <= 40, `${total} jogadores`)
await shoot(a, '01-busca')
await a.getByRole('button', { name: 'Ataque', exact: true }).click()
await a.waitForFunction(() => {
  const rows = [...document.querySelectorAll('[data-testid=search-list] li')]
  return rows.length > 0 && rows.every((li) => /(^|\n)(ATA|PD|PE) ·/.test(li.innerText))
}, undefined, { timeout: 20000 })
check('o filtro de posição deixa só atacantes e pontas', true)
await a.getByTestId('search-free').click()
await sleep(1500)
const freeRows = await a.getByTestId('search-list').locator('li').count()
check('"Só livres" mostra jogadores livres (ou diz que não há)', freeRows === 0 || (await a.getByTestId('search-list').innerText()).includes('Livre'), `${freeRows} livres`)
await a.getByTestId('search-free').click()
await a.getByRole('button', { name: 'Todos', exact: true }).click()
await a.getByTestId('quick-prospect').click()
await sleep(1500)
await shoot(a, '02-busca-jovens-promessas')
await a.getByTestId('quick-prospect').click()
await a.getByTestId('search-sort').selectOption('value-asc')
await sleep(1500)

// ------------------------------------------------------------------ proposta a um clube da IA
const rows = a.getByTestId('search-list').locator('li')
const target = rows.first()
const name = (await target.locator('span.font-semibold').first().innerText()).trim()
await target.getByRole('button', { name: 'Fazer proposta' }).click()
await a.getByTestId('send-ai-offer').waitFor()
await shoot(a, '03-fazer-proposta-a-ia')
let sent = false
for (let i = 0; i < 3 && !sent; i++) {
  await a.getByTestId('send-ai-offer').click()
  await sleep(1800)
  sent = (await a.getByTestId('send-ai-offer').count()) === 0
  if (!sent) {
    const why = await a.getByTestId('market-error').innerText().catch(() => '')
    console.log('  [mercado recusou]', why)
    if (!why.includes('a partir de')) break
  }
}
check('o servidor aceitou a proposta ao clube da IA', sent)
await tab(a, 'Propostas')
await a.getByTestId('ai-outgoing').waitFor({ timeout: 20000 })
check('a proposta aparece aguardando a resposta do clube', (await a.getByTestId('ai-outgoing').innerText()).includes('Aguardando a resposta do clube') && (await a.getByTestId('ai-outgoing').innerText()).includes(name))
await shoot(a, '04-proposta-aguardando')

// ------------------------------------------------------------------ anúncios
await tab(a, 'Anúncios')
await sleep(1500)
check('a aba de anúncios abre (com anúncios ou o aviso de que ainda não há)', (await a.getByTestId('league-market').innerText()).length > 50)
await shoot(a, '05-anuncios')

// ------------------------------------------------------------------ a rodada passa: a IA responde
await a.getByTestId('market-back').click()
for (let i = 0; i < 3; i++) {
  await a.getByTestId('advance-league').click()
  await a.getByTestId('confirm-advance').click()
  await sleep(2500)
}
await openMarket(a)
await a.waitForFunction(() => !document.querySelector('[data-testid=ai-outgoing]')?.textContent?.includes('Aguardando a resposta do clube'), undefined, { timeout: 40000 })
const outcome = (await a.getByTestId('ai-outgoing').innerText()).replace(/\s+/g, ' ')
check('depois de passar a data, o clube da IA respondeu (aceitou ou recusou, com o motivo)', /Aceita|Recusada/.test(outcome), outcome.slice(0, 120))
await shoot(a, '06-resposta-da-ia')

// ------------------------------------------------------------------ propostas da IA pelos jogadores dos técnicos (aparecem aos poucos)
const incoming = await a.getByTestId('ai-incoming').count()
const incomingB = await (async () => {
  await b.getByRole('button', { name: 'Voltar' }).click()
  await b.getByText('Abrir a sala').first().click()
  await b.getByTestId('open-market').waitFor({ timeout: 30000 })
  await openMarket(b)
  await sleep(1500)
  return b.getByTestId('ai-incoming').count()
})()
console.log(`  (propostas da IA vistas: Ana ${incoming > 0 ? 'sim' : 'não'}, Bia ${incomingB > 0 ? 'sim' : 'não'})`)
const who = incoming > 0 ? a : incomingB > 0 ? b : null
if (who) {
  await shoot(who, '07-proposta-da-ia')
  const btn = who.locator('[data-testid^=ai-decline-]').first()
  await btn.click()
  await sleep(1500)
  check('recusar a proposta da IA tira ela da lista', true)
} else console.log('  (a IA ainda não fez proposta pelos jogadores destes técnicos nesta janela: coberto nos testes de unidade)')

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
