// Teste de ponta a ponta da B8.6 (mercado entre técnicos), no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-6-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-6'
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
const shoot = async (page, name, full = false) => {
  const dialog = (await page.getByRole('dialog').count()) > 0
  if (dialog) await sleep(700)
  await sleep(200)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`), fullPage: full && !dialog })
}
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}
/** Põe o preço no mínimo permitido (cada liga de teste tem clubes de caixa diferente). */
const minFee = (page) =>
  page.getByTestId('offer-fee').evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, el.min)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
/** Envia a proposta; se o jogador pedir mais salário, a tela já põe o mínimo dele e o teste tenta de novo (até 3 vezes). */
const sendOffer = async (page) => {
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('send-offer').click()
    await sleep(1800)
    if ((await page.getByTestId('send-offer').count()) === 0) return true
    const why = await page.getByTestId('market-error').innerText().catch(() => '')
    console.log('  [mercado recusou]', why)
    if (!why.includes('a partir de')) return false
  }
  return false
}
const openMarket = async (page) => {
  await page.getByTestId('open-market').click()
  await page.getByTestId('league-market').waitFor()
}

// ------------------------------------------------------------------ liga com dois técnicos (clubes com elenco menor que 30)
const ana = await person('Ana Treinadora')
const a = ana.page
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga Mercado ${rnd()}`)
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
await b.getByRole('button', { name: 'Voltar' }).click()
await b.getByText('Abrir a sala').first().click()
await b.getByTestId('open-market').waitFor({ timeout: 30000 })

// ------------------------------------------------------------------ Ana vê o elenco da Bia e propõe a compra do jogador mais barato
await openMarket(a)
await a.waitForFunction(() => /janela (aberta|fechada)/i.test(document.querySelector('[data-testid=league-market]')?.textContent ?? ''), undefined, { timeout: 20000 })
check('a janela de transferências está aberta no começo do ano', (await a.getByTestId('league-market').innerText()).toLowerCase().includes('janela aberta'))
await shoot(a, '01-mercado-propostas-vazio')
await a.getByRole('button', { name: 'Técnicos' }).click()
await a.locator('[data-testid^=coach-]').first().click()
await a.getByTestId('coach-squad').waitFor()
await shoot(a, '02-elenco-do-outro-tecnico')
const buys = a.locator('[data-testid^=buy-]')
const lastBuy = buys.last()
const player = (await lastBuy.locator('xpath=ancestor::li').locator('span.font-semibold').first().innerText()).trim()
await lastBuy.click()
await a.getByRole('dialog').last().waitFor()
check('a janela de proposta mostra a faixa de preço permitida', (await a.getByRole('dialog').last().innerText()).includes('precisa ficar entre'))
await minFee(a)
await shoot(a, '03-fazer-proposta')
check('a proposta foi aceita pelo servidor (preço, janela, orçamento e consentimento do jogador conferidos)', await sendOffer(a))
await a.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 20000 })
await a.getByRole('button', { name: /^Propostas/ }).click()
await a.getByTestId('offers-list').waitFor({ timeout: 20000 })
check('a proposta aparece como aguardando a Bia, com o dinheiro reservado', (await a.getByTestId('offers-list').innerText()).includes('Aguardando resposta de Bia') && (await a.getByTestId('market-reserved').innerText()).includes('reservado'))
await shoot(a, '04-proposta-enviada')

// ------------------------------------------------------------------ Bia recebe, contrapropõe; Ana aceita
await openMarket(b)
await b.getByTestId('offers-list').waitFor({ timeout: 30000 })
check('a Bia vê a proposta para responder', (await b.getByTestId('offers-list').innerText()).includes(player))
await shoot(b, '05-proposta-recebida')
await b.locator('[data-testid^=counter-]').first().click()
await b.getByRole('dialog').waitFor()
await b.getByTestId('counter-fee').evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(Math.min(Number(el.max), Number(el.value) + 100000)))
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await shoot(b, '06-contraproposta')
await b.getByTestId('confirm-counter').click()
await b.getByRole('dialog').waitFor({ state: 'detached', timeout: 20000 })
await b.waitForFunction(() => document.querySelector('[data-testid=offers-list]')?.textContent?.includes('Aguardando resposta de Ana'), undefined, { timeout: 20000 })
check('depois da contraproposta a vez passa para a Ana', true)

await a.waitForFunction(() => document.querySelector('[data-testid=offers-list]')?.textContent?.includes('1ª contraproposta'), undefined, { timeout: 30000 })
await a.locator('[data-testid^=accept-]').first().click()
await a.waitForFunction(() => !document.querySelector('[data-testid=offers-list] li'), undefined, { timeout: 30000 })
check('a Ana aceitou: a proposta sai da lista de abertas', true)

// ------------------------------------------------------------------ histórico público (os dois veem), na sala também
await a.getByRole('button', { name: 'Histórico' }).click()
await a.getByTestId('history-list').waitFor({ timeout: 20000 })
check('a transferência aparece no histórico público', (await a.getByTestId('history-list').innerText()).includes(player))
await shoot(a, '07-historico')
await b.getByRole('button', { name: 'Histórico' }).click()
await b.getByTestId('history-list').waitFor({ timeout: 30000 })
check('a Bia também vê o histórico', (await b.getByTestId('history-list').innerText()).includes(player))
await b.locator('[data-testid^=report-tr-]').first().click()
await b.getByRole('dialog').waitFor()
await shoot(b, '08-denunciar')
await b.getByTestId('report-reason-laranja').click()
await b.getByRole('dialog').waitFor({ state: 'detached', timeout: 20000 })
await a.getByTestId('market-back').click()
await a.getByTestId('room-transfers').waitFor({ timeout: 30000 })
check('as últimas transferências aparecem na sala da liga', (await a.getByTestId('room-transfers').innerText()).includes(player))
await openMarket(a)
await a.getByRole('button', { name: 'Histórico' }).click()
await a.waitForFunction(() => document.querySelector('[data-testid=history-list]')?.textContent?.includes('denúncia'), undefined, { timeout: 30000 })
check('a Ana (ADM) vê que a transferência foi denunciada', true)
await shoot(a, '09-adm-ve-denuncia')

// ------------------------------------------------------------------ o limite do par: tenta comprar outra vez e confere as regras no servidor (compra repetida de quem já vendeu)
await a.getByRole('button', { name: 'Técnicos' }).click()
await a.locator('[data-testid^=coach-]').first().click()
await a.getByTestId('coach-squad').waitFor()
const second = a.locator('[data-testid^=buy-]').last()
await second.click()
await a.getByTestId('send-offer').waitFor()
await minFee(a)
const okSecond = await sendOffer(a)
check('a segunda compra do mesmo par na janela ainda passa (limite é 2)', okSecond)
if (okSecond) await a.getByRole('dialog').first().waitFor({ state: 'detached', timeout: 20000 })

// ------------------------------------------------------------------ jogadores livres (se houver)
await a.getByRole('button', { name: 'Livres' }).click()
await a.getByTestId('free-list').waitFor({ state: 'attached', timeout: 20000 })
const frees = await a.locator('[data-testid^=sign-]').count()
await shoot(a, '10-jogadores-livres')
if (frees > 0) {
  await a.locator('[data-testid^=sign-]').first().click()
  await a.getByRole('dialog').waitFor()
  await a.getByTestId('confirm-sign').click()
  await a.waitForFunction(() => !document.querySelector('[role=dialog]') || document.querySelector('[data-testid=market-error]'), undefined, { timeout: 20000 })
  check('contratar um jogador livre dá uma resposta (contratou ou mostra o motivo)', true)
} else console.log('  (sem jogadores livres neste mundo: contratação coberta nos testes de unidade)')

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
