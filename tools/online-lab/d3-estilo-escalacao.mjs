// Estilo e mentalidade na Escalação, na Tática e na partida são a mesma escolha (Fase 6D). Jogo solo, sem servidor.
//   npx vite --port 4173 --strictPort    e depois    cd tools/online-lab && node d3-estilo-escalacao.mjs
import { chromium } from 'playwright'
import { resolve } from 'node:path'
const base = process.argv[2] ?? 'http://localhost:4173'
let failed = 0
const check = (name, ok) => { console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}`); if (!ok) failed++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })).newPage()
page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
const style = () => page.evaluate(() => { const g = window.__mm.getGame(); return g.season.teams.find((t) => t.id === g.userTeamId).tactic.style })
const mentality = () => page.evaluate(() => { const g = window.__mm.getGame(); return g.season.teams.find((t) => t.id === g.userTeamId).tactic.mentality })
await page.goto(`${base}/?time=imp&semente=7&jogo=1&tela=squad&aba=lineup`)
await page.getByTestId('style-controls').waitFor({ timeout: 60000 })
const labels = await page.getByTestId('style-controls').innerText()
check('a Escalação lista os 5 estilos', ['Toque de bola', 'Contra-ataque', 'Pressão total', 'Lançamento direto', 'Jogar pelas pontas'].every((l) => labels.includes(l)))
await page.getByTestId('style-controls').getByRole('button', { name: 'Jogar pelas pontas' }).click()
await page.getByRole('button', { name: 'Muito ofensiva' }).click()
await sleep(400)
check('escolher na Escalação muda a tática do time', (await style()) === 'wings' && (await mentality()) === 2)
await page.getByTestId('style-controls').scrollIntoViewIfNeeded()
await page.screenshot({ path: resolve('../../.shots/d3-escalacao-estilo.png') })
// A mesma escolha aparece na partida.
await page.getByRole('button', { name: 'Início', exact: true }).first().click()
await page.getByRole('button', { name: 'Ir para a partida' }).click()
await page.getByTestId('speed').waitFor({ timeout: 60000 })
await page.getByRole('button', { name: 'Tática', exact: true }).first().click()
const inMatch = await page.getByTestId('style-controls').innerText()
check('a partida mostra o mesmo estilo (descrição das pontas)', (await page.locator('main').innerText()).includes('Laterais e pontas puxam o jogo'))
// Mudar na partida muda a tática do time (vale na Escalação e no próximo jogo).
await page.getByTestId('style-controls').getByRole('button', { name: 'Pressão total' }).click()
await page.getByRole('button', { name: 'Defensiva', exact: true }).first().click()
await sleep(500)
check('mudar na partida muda a tática do time', (await style()) === 'high-press' && (await mentality()) === -1)
await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
