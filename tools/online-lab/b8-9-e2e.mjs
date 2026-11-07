// Teste de ponta a ponta da pendência 1 (anunciar, vender direto à IA e pré-contrato no mercado online), no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 4173 --strictPort
//   cd tools/online-lab && node b8-9-e2e.mjs [http://localhost:4173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const prefix = process.argv[3] ?? 'b8-9'
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

// ------------------------------------------------------------------ (cont.)
// ------------------------------------------------------------------ anunciar um jogador
await openMarket(a)
await tab(a, 'Vender')
await a.getByTestId('mine-list').locator('li').first().waitFor({ timeout: 30000 })
const squad = await a.getByTestId('mine-list').locator('li').count()
check('"Vender" lista o meu elenco', squad >= 18, `${squad} jogadores`)
await shoot(a, '01-vender-elenco')
const firstId = (await a.getByTestId('mine-list').locator('li').nth(4).getAttribute('data-testid')).replace('mine-', '')
await a.getByTestId(`list-${firstId}`).click()
await a.getByTestId('confirm-list').waitFor()
await shoot(a, '02-anunciar')
await a.getByTestId('confirm-list').click()
await a.getByTestId(`unlist-${firstId}`).waitFor({ timeout: 20000 })
check('o jogador aparece anunciado, com o botão de tirar o anúncio', (await a.getByTestId(`mine-${firstId}`).innerText()).includes('À venda por'))
await shoot(a, '03-anunciado')
await a.getByTestId(`unlist-${firstId}`).click()
await a.getByTestId(`list-${firstId}`).waitFor({ timeout: 20000 })
check('tirar o anúncio devolve o botão Anunciar', true)

// ------------------------------------------------------------------ vender direto a um clube da IA
let resolved = false
let accepted = false
const count = await a.getByTestId('mine-list').locator('li').count()
for (let i = count - 1; i >= 0 && !resolved; i--) {
  const pid = (await a.getByTestId('mine-list').locator('li').nth(i).getAttribute('data-testid')).replace('mine-', '')
  await a.getByTestId(`sell-${pid}`).click()
  await a.getByTestId('buyer-select').waitFor()
  await a.waitForFunction(() => !document.querySelector('[data-testid=buyer-select]')?.textContent?.includes('Procurando'), undefined, { timeout: 20000 })
  const options = await a.getByTestId('buyer-select').locator('option').count()
  if (options > 1) {
    await a.getByTestId('buyer-select').selectOption({ index: 1 })
    await shoot(a, '04-vender-a-clube-da-ia')
    await a.getByTestId('confirm-sell').click()
    await sleep(2000)
    if ((await a.getByTestId('confirm-sell').count()) === 0) {
      accepted = true
      resolved = true
    } else if ((await a.getByTestId('sale-refused').count()) > 0) {
      const why = await a.getByTestId('sale-refused').innerText()
      console.log('  [clube recusou]', why)
      if (!accepted) await shoot(a, '05-venda-recusada')
      check('a recusa mostra o motivo na própria janela', why.length > 10)
      await a.getByRole('button', { name: /Fechar|×/ }).first().click().catch(() => a.keyboard.press('Escape'))
    }
  } else await a.keyboard.press('Escape')
  await sleep(500)
  if ((await a.getByTestId('buyer-select').count()) > 0) await a.keyboard.press('Escape')
}
console.log(`  (venda direta: ${accepted ? 'aceita' : 'sem aceite nos jogadores tentados'})`)
if (accepted) {
  await shoot(a, '06-venda-feita')
  check('depois da venda o elenco ficou com um jogador a menos', (await a.getByTestId('mine-list').locator('li').count()) === count - 1)
}

// ------------------------------------------------------------------ pré-contrato (abre perto do meio do ano: avança a liga)
await a.getByTestId('market-back').click()
let preOpen = false
for (let round = 0; round < 60 && !preOpen; round++) {
  for (let i = 0; i < 4; i++) {
    await a.getByTestId('advance-league').click()
    await a.getByTestId('confirm-advance').click()
    await sleep(1800)
  }
  await openMarket(a)
  await tab(a, 'Pré-contrato')
  await sleep(1200)
  preOpen = (await a.getByTestId('league-market').innerText()).includes('pré-contratos estão abertos')
  if (!preOpen) await a.getByTestId('market-back').click()
}
check('os pré-contratos abrem no meio da temporada', preOpen)
if (preOpen) {
  await a.getByTestId('pre-list').locator('li').first().waitFor({ timeout: 20000 }).catch(() => {})
  const targets = await a.getByTestId('pre-list').locator('li').count()
  check('há jogadores de clubes da IA para propor pré-contrato', targets > 0, `${targets} jogadores`)
  await shoot(a, '07-pre-contrato-lista')
  if (targets > 0) {
    await a.getByTestId('pre-list').locator('li').first().getByRole('button').click()
    await a.getByTestId('send-pre').waitFor()
    await shoot(a, '08-pre-contrato-proposta')
    let signed = false
    for (let i = 0; i < 4 && !signed; i++) {
      await a.getByTestId('send-pre').click()
      await sleep(1800)
      signed = (await a.getByTestId('send-pre').count()) === 0
      if (!signed && (await a.getByTestId('sale-refused').count()) > 0) {
        const why = await a.getByTestId('sale-refused').innerText()
        console.log('  [jogador recusou]', why)
        if (i === 0) await shoot(a, '09-pre-contrato-recusado')
        // sobe o salário até ele aceitar
        await a.getByTestId('pre-salary').evaluate((el, v) => { el.value = String(Math.min(Number(el.max), Number(el.value) + (Number(el.max) - Number(el.min)) / 3)); el.dispatchEvent(new Event('input', { bubbles: true })) }, 0)
      }
    }
    check('o jogador aceitou o pré-contrato (subindo o salário se preciso)', signed)
    if (signed) {
      await a.getByTestId('pre-arriving').waitFor({ timeout: 20000 })
      check('ele aparece em "Chegam na virada"', true)
      await shoot(a, '10-pre-contrato-assinado')
    }
  }
}
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
