// Estilo de jogo mudado DURANTE a partida online fica gravado na tática do time (Fase 6D), no navegador, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787      (sem provocar lesões: a partida precisa chegar ao fim)
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 4173 --strictPort
//   cd tools/online-lab && node d4-online-estilo-e2e.mjs [http://localhost:4173]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
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
const commands = []
page.on('request', (req) => {
  if (req.url().endsWith('/command') && req.method() === 'POST') commands.push(req.postData() ?? '')
})
const tactic = () => page.evaluate(() => { const g = window.__mm.getGame(); const t = g.season.teams.find((x) => x.id === g.userTeamId).tactic; return { style: t.style, mentality: t.mentality } })

// ------------------------------------------------------------------ liga ao vivo com um técnico, até a partida abrir
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Estilo')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Estilo ${rnd()}`)
await page.getByRole('button', { name: 'Assistir ao vivo' }).click()
for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Menos' }).click()
await page.getByRole('button', { name: 'Criar a liga' }).click()
await page.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
await page.getByTestId('pick-club').click()
await page.getByTestId('club-list').waitFor({ timeout: 60000 })
await page.locator('[data-testid^=club-team-]:not([disabled])').nth(0).click()
await page.getByRole('button', { name: 'Assumir este clube' }).click()
await page.getByTestId('members').getByText('Ana Estilo').waitFor()
await page.getByTestId('start-league').click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })

// ------------------------------------------------------------------ a Escalação online mostra o seletor e o próximo adversário
await page.getByRole('button', { name: /^Elenco/ }).first().click()
await page.getByRole('tab', { name: /^Escalação/ }).click()
await page.getByTestId('next-opponent').waitFor({ timeout: 30000 })
check('na Escalação online aparece o próximo adversário com formação, estilo e mentalidade', /Formação[\s\S]*Estilo[\s\S]*Mentalidade/.test(await page.getByTestId('next-opponent-tactic').innerText()))
check('e o seletor de estilo com os 5 estilos', (await page.getByTestId('style-controls').innerText()).includes('Lançamento direto'))
await page.getByTestId('next-opponent').scrollIntoViewIfNeeded()
await page.screenshot({ path: resolve(shots, 'd4-escalacao-online.png') })

// ------------------------------------------------------------------ o ADM avança, o técnico dá Pronto e a partida abre sozinha
await page.getByRole('button', { name: 'Clube', exact: true }).first().click()
await page.getByRole('button', { name: /^ADM/ }).click()
await page.getByTestId('advance-league').click()
await page.getByTestId('confirm-action').click()
await page.getByRole('button', { name: 'Clube', exact: true }).first().click()
await page.getByTestId('league-ready').waitFor({ timeout: 30000 })
await page.getByTestId('league-ready').click()
await page.getByTestId('speed').waitFor({ timeout: 60000 })

// ------------------------------------------------------------------ muda o estilo e a mentalidade durante a partida
const before = await tactic()
await page.getByRole('button', { name: 'Tática', exact: true }).first().click()
const target = before.style === 'high-press' ? 'Lançamento direto' : 'Pressão total'
const targetStyle = before.style === 'high-press' ? 'direct' : 'high-press'
const targetMentality = before.mentality === -1 ? 1 : -1
const mentalityLabel = targetMentality === -1 ? 'Defensiva' : 'Ofensiva'
commands.length = 0
await page.getByTestId('style-controls').getByRole('button', { name: target, exact: true }).click()
await page.getByRole('button', { name: mentalityLabel, exact: true }).first().click()
await sleep(1500)
const mid = await tactic()
check('durante a partida o estilo e a mentalidade mudam na tática do time (no aparelho)', mid.style === targetStyle && mid.mentality === targetMentality, `${before.style}/${before.mentality} -> ${mid.style}/${mid.mentality}`)
check('o aparelho mandou o comando de tática ao servidor', commands.some((c) => c.includes(`"style":"${targetStyle}"`)) && commands.some((c) => c.includes(`"mentality":${targetMentality}`)), `${commands.length} comando(s)`)
await page.screenshot({ path: resolve(shots, 'd4-partida-online-estilo.png') })

// ------------------------------------------------------------------ a partida termina e a escolha continua gravada
await page.getByRole('button', { name: 'Voltar ao painel' }).waitFor({ timeout: 360000 })
await page.getByRole('button', { name: 'Voltar ao painel' }).click()
await page.getByTestId('league-card').waitFor()
const after = await tactic()
check('depois do jogo a tática do time continua com o que foi escolhido na partida (no aparelho)', after.style === targetStyle && after.mentality === targetMentality, `${after.style}/${after.mentality}`)

// Sem o espelho guardado, o aparelho baixa tudo do servidor: a tática vem de lá.
await page.getByRole('button', { name: 'Menu', exact: true }).click()
await page.getByTestId('online-account').waitFor({ timeout: 30000 })
await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.deleteDatabase('meu-manager-espelho'); r.onsuccess = r.onerror = r.onblocked = () => resolve(undefined) }))
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByText('Abrir a sala').first().click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
await page.waitForFunction(() => window.__mm.getGame()?.season?.teams?.length > 0, undefined, { timeout: 30000 })
const server = await tactic()
check('o servidor guardou a tática: reabrindo o jogo sem o espelho guardado ela vem igual', server.style === targetStyle && server.mentality === targetMentality, `${server.style}/${server.mentality}`)
await page.getByRole('button', { name: 'Clube', exact: true }).first().click()
await page.getByRole('button', { name: /^Elenco/ }).first().click()
await page.getByRole('tab', { name: /^Escalação/ }).click({ timeout: 60000 }).catch(async (e) => { await page.screenshot({ path: resolve(shots, 'd4-debug.png') }); throw e })
await page.getByTestId('style-controls').waitFor()
check('e a Escalação mostra o estilo escolhido na partida', (await page.locator('main').innerText()).includes(targetStyle === 'high-press' ? 'Recupera a bola no campo do rival' : 'Bola longa para os atacantes'))

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
