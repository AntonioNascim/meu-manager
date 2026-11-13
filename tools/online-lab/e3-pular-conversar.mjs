// Ponta a ponta: Conversar, número da camisa (comandos ao servidor) e Pular na partida online, no navegador, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node e3-pular-conversar.mjs [http://localhost:5173]
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
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
const shoot = async (name) => {
  await sleep(400)
  await page.screenshot({ path: resolve(shots, `e3-${name}.png`) })
}

// ------------------------------------------------------------------ liga ao vivo com um técnico
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Treinadora')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Pular ${rnd()}`)
await page.getByRole('button', { name: 'Assistir ao vivo' }).click()
for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Menos' }).click()
await page.getByRole('button', { name: 'Criar a liga' }).click()
await page.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
await page.getByTestId('pick-club').click()
await page.getByTestId('club-list').waitFor({ timeout: 60000 })
await page.locator('[data-testid^=club-team-]:not([disabled])').nth(0).click()
await page.getByRole('button', { name: 'Assumir este clube' }).click()
await page.getByTestId('members').getByText('Ana Treinadora').waitFor()
await page.getByTestId('start-league').click()
await page.getByTestId('status-next').waitFor({ timeout: 60000 })
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })

// ------------------------------------------------------------------ cartão do jogador: Conversar e camisa
await page.getByRole('button', { name: 'Elenco', exact: true }).first().click()
await page.waitForSelector('ul li button', { timeout: 60000 })
await page.locator('ul li button').first().click()
await page.getByTestId('player-card').waitFor({ timeout: 30000 })
check('o cartão do jogador abre na liga online', true)
await page.getByRole('button', { name: 'Conversar', exact: true }).click()
await page.getByTestId('talk-panel').waitFor()
await shoot('conversar')
const moralBefore = await page.locator('text=Moral').first().locator('xpath=..').innerText().catch(() => '')
await page.getByTestId('talk-praise').click()
const resultEl = page.getByTestId('talk-result')
await resultEl.waitFor({ timeout: 20000 })
const resultText = await resultEl.innerText()
check('Conversar responde pelo servidor (gostou ou reagiu mal, com a moral)', /Ele gostou|Ele reagiu mal/.test(resultText) && /moral [+-]\d/.test(resultText), resultText)
await sleep(800)
check('depois da conversa os botões travam (intervalo entre conversas)', await page.getByTestId('talk-demand').isDisabled())
await shoot('conversar-resultado')
void moralBefore

await page.getByTestId('shirt-number').click()
await page.getByRole('textbox', { name: 'Número da camisa' }).fill('77')
await page.getByRole('button', { name: 'Salvar' }).click()
await sleep(1500)
check('o número da camisa trocado vale e volta do servidor', (await page.getByTestId('shirt-number').innerText()).includes('77'))
await shoot('camisa')
await page.getByRole('button', { name: 'Fechar' }).first().click()

// ------------------------------------------------------------------ o ADM avança até uma rodada em que o clube joga
let watching = false
for (let tries = 0; tries < 8 && !watching; tries++) {
  await page.getByRole('button', { name: 'Início', exact: true }).first().click()
  await page.getByRole('button', { name: /^ADM/ }).click()
  await page.getByTestId('advance-league').click()
  await page.getByTestId('confirm-action').click()
  await page.getByRole('button', { name: 'Início', exact: true }).first().click()
  const ready = await page.getByTestId('league-ready').waitFor({ timeout: 10000 }).then(() => true, () => false)
  if (ready) {
    await page.getByTestId('league-ready-counter').waitFor({ timeout: 20000 })
    await page.getByTestId('league-ready').click()
    watching = await page.getByTestId('speed').waitFor({ timeout: 40000 }).then(() => true, () => false)
  } else {
    await page.getByTestId('league-open-room').click()
    await page.getByTestId('status-next').waitFor({ timeout: 180000 })
  }
}
check('a partida online abre', watching)

// ------------------------------------------------------------------ Pular contra a IA: vai direto ao fim
check('a barra de baixo some na partida', (await page.locator('nav[aria-label="Navegação principal"]').count()) === 0)
const skip = page.getByTestId('online-skip')
await skip.waitFor({ timeout: 60000 })
await shoot('antes-de-pular')
const t0 = Date.now()
await skip.click()
await page.getByRole('button', { name: 'Voltar ao painel' }).waitFor({ timeout: 60000 })
const secs = Math.round((Date.now() - t0) / 1000)
check('Pular leva a partida ao fim na hora (a IA joga o resto)', (await page.locator('main').innerText()).includes('Fim de jogo'), `${secs} s`)
check('contra a IA não fica esperando o adversário', secs < 30)
await shoot('depois-de-pular')
await page.getByRole('button', { name: 'Voltar ao painel' }).click()
await page.getByTestId('league-card').waitFor()
check('a barra de baixo volta depois da partida', (await page.locator('nav[aria-label="Navegação principal"]').count()) === 1)
await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
