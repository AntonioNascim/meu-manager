// Teste de ponta a ponta da Fase 6C (C4: mercado e finanças), no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c4-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'c4'
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
const shoot = async (p, name) => {
  await sleep(500)
  const file = resolve(shots, `${prefix}-${name}.png`)
  await p.screenshot({ path: file })
  return file
}

// ------------------------------------------------------------------ conta, liga, clube, início
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Treinadora')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Mercado ${rnd()}`)
await page.getByRole('button', { name: 'Resultado direto' }).click()
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

// ------------------------------------------------------------------ abrir o jogo
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
const tab = async (name) => page.getByRole('button', { name: new RegExp('^' + name) }).first().click()
const offers = () => page.evaluate(() => window.__mm.getGame().season.market.offers.length)
const shots1 = {}

// ------------------------------------------------------------------ Mercado: buscar e propor a um clube da IA
await tab('Transferências')
await sleep(800)
shots1.mercado = await shoot(page, 'online-mercado')
check('a aba Técnicos existe no Mercado online', (await page.getByRole('tab', { name: 'Técnicos', exact: true }).count()) > 0)
await page.getByRole('tab', { name: 'Buscar', exact: true }).click().catch(() => {})
const before = await offers()
await page.getByRole('button', { name: /Cabem no bolso/ }).click()
await sleep(500)
await page.locator('ul.divide-y li button').first().click()
await page.getByRole('button', { name: 'Enviar proposta' }).waitFor({ timeout: 15000 })
shots1.negociacao = await shoot(page, 'online-negociacao')
await page.getByRole('button', { name: 'Enviar proposta' }).click()
await sleep(1500)
// Elenco cheio: a primeira proposta é recusada e a pessoa libera alguém. Com vaga no elenco ela já passa (a janela fecha).
const stillOpen = (await page.getByRole('button', { name: 'Enviar proposta' }).count()) > 0
if (stillOpen) {
  const sheetError = await page.locator('p.text-loss').allInnerTexts()
  console.log('  erro mostrado na tela:', JSON.stringify(sheetError), '| ofertas agora:', await offers())
  shots1.recusa = await shoot(page, 'online-recusa')
  await page.evaluate(async () => { const g = window.__mm.getGame(); const mine = g.season.players.filter((p) => p.teamId === g.userTeamId); mine.sort((a, b) => a.contract.salary - b.contract.salary); await window.__mm.perform({ type: 'release-player', playerId: mine[0].id }) })
  await sleep(800)
  await page.getByRole('button', { name: 'Enviar proposta' }).click()

  await sleep(2500)
} else {
  await sleep(2500)
}
await shoot(page, 'debug')
const after = await offers()
check('a proposta à IA foi ao servidor e voltou no espelho', after >= before + 1, `${before} -> ${after}`)

// ------------------------------------------------------------------ Propostas enviadas e Técnicos
await page.getByRole('tab', { name: 'Propostas', exact: true }).click()
await page.getByRole('tab', { name: 'Enviadas', exact: true }).click()
await sleep(500)
check('a proposta aparece em Propostas > Enviadas', (await page.locator('main').innerText()).toLowerCase().includes('aguardando'))
shots1.propostas = await shoot(page, 'online-propostas')
await page.getByRole('tab', { name: 'Técnicos', exact: true }).click()
await page.getByTestId('open-coaches-market').click()
await page.getByTestId('league-market').waitFor({ timeout: 20000 })
check('o mercado entre técnicos abre dentro do Mercado do jogo', true)
shots1.tecnicos = await shoot(page, 'online-tecnicos')
await page.getByTestId('market-back').click()

// ------------------------------------------------------------------ Finanças: pedir verba (a resposta da diretoria vem do servidor)
await tab('Mais')
await page.getByRole('button', { name: 'Finanças' }).first().click()
await sleep(800)
shots1.financas = await shoot(page, 'online-financas')
await page.getByRole('button', { name: 'Pedir verba' }).click()
await page.getByRole('status').first().waitFor({ timeout: 15000 })
const verba = await page.getByRole('status').first().innerText()
check('o pedido de verba tem resposta da diretoria', verba.length > 5, verba.slice(0, 80))
shots1.verba = await shoot(page, 'online-verba')

// ------------------------------------------------------------------ o mesmo no jogo solo, lado a lado
const solo = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const sp = await solo.newPage()
const soloShot = async (query, name) => {
  await sp.goto(`${base}/?time=imp&semente=7${query}`)
  await sp.waitForSelector('main', { timeout: 60000 })
  return shoot(sp, `solo-${name}`)
}
const shotsSolo = { mercado: await soloShot('&tela=market', 'mercado'), financas: await soloShot('&tela=finance', 'financas') }
const side = await browser.newContext({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 1 })
const sidePage = await side.newPage()
for (const key of Object.keys(shotsSolo)) {
  const a = readFileSync(shotsSolo[key]).toString('base64')
  const b = readFileSync(shots1[key]).toString('base64')
  await sidePage.setContent(`<body style="margin:0;background:#111;color:#ddd;font:14px sans-serif"><div style="display:flex;gap:12px;padding:8px"><div><div style="padding:4px">Solo</div><img style="width:380px" src="data:image/png;base64,${a}"></div><div><div style="padding:4px">Online</div><img style="width:380px" src="data:image/png;base64,${b}"></div></div></body>`)
  await sidePage.screenshot({ path: resolve(shots, `${prefix}-lado-${key}.png`), fullPage: true })
}
await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
