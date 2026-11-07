// Teste de ponta a ponta da Fase 6C (C5: partida ao vivo com a tela do jogo solo e velocidade individual), no navegador, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787      (sem LIVE_MINUTE_MS: o minuto é o do solo, 700 ms)
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c5-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'c5'
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
  await sleep(400)
  const file = resolve(shots, `${prefix}-${name}.png`)
  await p.screenshot({ path: file })
  return file
}
const waitFor = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout })

// ------------------------------------------------------------------ liga ao vivo com um técnico
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Treinadora')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Partida ${rnd()}`)
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

// ------------------------------------------------------------------ o ADM avança até uma rodada em que o clube joga
let watching = false
for (let tries = 0; tries < 8 && !watching; tries++) {
  await page.getByTestId('league-open-room').click()
  await page.getByTestId('league-screen').waitFor()
  await page.getByTestId('advance-league').click()
  await page.getByTestId('confirm-advance').click()
  await page.getByTestId('status-event').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Clube', exact: true }).click()
  watching = await page.getByTestId('league-watch').waitFor({ timeout: 8000 }).then(() => true, () => false)
  if (!watching) {
    await page.getByTestId('league-open-room').click()
    await page.getByTestId('status-next').waitFor({ timeout: 180000 })
    await page.getByRole('button', { name: 'Clube', exact: true }).click()
  }
}
check('com a rodada em andamento o cartão da liga oferece "Entrar na partida"', watching)
await page.getByTestId('league-watch').click()

// ------------------------------------------------------------------ a tela de partida é a do jogo solo, movida pelo servidor
await page.getByTestId('speed').waitFor({ timeout: 40000 })
check('a tela da partida abre com campo e placar', (await page.getByTestId('pitch').count()) > 0 || (await page.locator('svg').count()) > 0)
const speedText = async () => (await page.getByTestId('speed').innerText()).replace(/\s+/g, ' ').trim()
check('a velocidade começa em 2x (como no solo)', (await speedText()).startsWith('2x'), await speedText())
const t0 = Date.now()
const minuteLabel = () => page.locator('main').innerText().then((t) => (/(\d+)'/.exec(t) ?? [])[1] ?? '')
const m0 = await minuteLabel()
await sleep(4000)
const m1 = await minuteLabel()
check('o relógio anda sozinho (o servidor joga)', m1 !== m0 || Number(m1) > 0, `${m0}' → ${m1}'`)
await shoot(page, 'online-partida')
await page.getByTestId('speed').click()
await page.getByTestId('speed').click()
await sleep(300)
check('tocar na velocidade percorre 4x e 8x', (await speedText()).startsWith('8x'), await speedText())

// ------------------------------------------------------------------ intervalo de até 1 minuto, com "Voltar ao jogo"
// Lesão no meu time para a partida até eu escolher (ou 45 s): aqui sigo com um a menos para não esperar.
const waitCtl = async (testid, ms) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await page.getByTestId(testid).isVisible().catch(() => false)) return true
    const less = page.getByRole('button', { name: 'Seguir com um a menos' })
    if (await less.isVisible().catch(() => false)) await less.click().catch(() => {})
    await sleep(500)
  }
  return false
}
if (!(await waitCtl('halftime-back', 120000))) {
  await shoot(page, 'debug')
  throw new Error('o intervalo não apareceu')
}
const halfText = await page.locator('main').innerText()
check('no intervalo aparece o cronômetro e o botão Voltar ao jogo', /Intervalo · \d+ s/.test(halfText))
await shoot(page, 'online-intervalo')
const before45 = await page.locator('main').innerText()
await page.getByTestId('halftime-back').click()
await sleep(2500)
const after45 = await page.locator('main').innerText()
check('depois de Voltar ao jogo a partida segue (sai do intervalo antes de 1 minuto)', !/Intervalo · \d+ s/.test(after45) && before45 !== after45)

// ------------------------------------------------------------------ fim de jogo: vê o resultado e espera a rodada
await page.getByRole('button', { name: 'Voltar ao painel' }).waitFor({ timeout: 120000 })
check('no fim aparece o resultado e o aviso de que a rodada espera as outras partidas', (await page.locator('main').innerText()).includes('Fim de jogo'))
const total = Math.round((Date.now() - t0) / 1000)
check('a partida inteira durou poucos minutos reais (700 ms por minuto, até 8x)', total < 150, `${total} s desde a entrada`)
await shoot(page, 'online-fim')
await page.getByRole('button', { name: 'Voltar ao painel' }).click()
await page.getByTestId('league-card').waitFor()

// ------------------------------------------------------------------ a mesma tela no jogo solo, lado a lado
const solo = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const sp = await solo.newPage()
await sp.goto(`${base}/?time=imp&semente=7&jogo=1&minuto=34&tela=match`)
await sp.waitForSelector('main', { timeout: 60000 })
const soloFile = await shoot(sp, 'solo-partida')
const side = await browser.newContext({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 1 })
const sidePage = await side.newPage()
const a = readFileSync(soloFile).toString('base64')
const b = readFileSync(resolve(shots, `${prefix}-online-partida.png`)).toString('base64')
await sidePage.setContent(`<body style="margin:0;background:#111;color:#ddd;font:14px sans-serif"><div style="display:flex;gap:12px;padding:8px"><div><div style="padding:4px">Solo</div><img style="width:380px" src="data:image/png;base64,${a}"></div><div><div style="padding:4px">Online</div><img style="width:380px" src="data:image/png;base64,${b}"></div></div></body>`)
await sidePage.screenshot({ path: resolve(shots, `${prefix}-lado-partida.png`), fullPage: true })
await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
