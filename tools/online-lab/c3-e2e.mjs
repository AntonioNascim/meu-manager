// Teste de ponta a ponta da Fase 6C (C3): a liga online com as telas do jogo solo, no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c3-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
// Salva em .shots/ capturas de 380 px da tela online e, ao lado, a mesma tela do jogo solo (c3-lado-<tela>.png).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'c3'
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
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200))
})
const shoot = async (p, name) => {
  await sleep(500)
  const file = resolve(shots, `${prefix}-${name}.png`)
  await p.screenshot({ path: file })
  return file
}
const game = () => page.evaluate(() => {
  const g = window.__mm.getGame()
  if (!g) return null
  const t = g.season.teams.find((x) => x.id === g.userTeamId)
  return { online: g.online ?? null, team: t.name, formation: t.tactic.formationId, style: t.tactic.style, plan: g.season.training.plans[g.userTeamId] ?? null, players: g.season.players.length, date: g.season.season.currentDate }
})

// ------------------------------------------------------------------ conta, liga, clube, início
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Treinadora')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Espelho ${rnd()}`)
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
check('liga iniciada', true)

// ------------------------------------------------------------------ abrir o jogo
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
const g0 = await game()
check('o jogo online abre com o espelho do mundo', !!g0?.online && g0.players > 1000, JSON.stringify(g0))
check('o painel não tem o botão Avançar (a liga avança o tempo)', (await page.getByRole('button', { name: 'Avançar', exact: true }).count()) === 0)
check('o cartão da liga mostra a próxima rodada', (await page.getByTestId('league-status').innerText()).toLowerCase().includes('rodada'))
const shots1 = {}
shots1.painel = await shoot(page, 'online-painel')
await page.getByTestId('league-card').scrollIntoViewIfNeeded()
await shoot(page, 'online-cartao-liga')
await page.getByTestId('league-open-room').click()
await page.getByTestId('league-screen').waitFor({ timeout: 30000 })
await page.getByTestId('status-next').waitFor({ timeout: 30000 })
check('a sala da liga abre dentro do jogo (Pronto, Avançar e ritmo)', (await page.getByTestId('league-screen').innerText()).toLowerCase().includes('próxima rodada'))
await shoot(page, 'online-sala-da-liga')
await page.getByRole('button', { name: 'Clube', exact: true }).click()

const tab = async (name) => page.getByRole('button', { name, exact: true }).first().click()
// ------------------------------------------------------------------ Elenco, Treino, Base
await tab('Elenco')
await page.getByText('Jogadores').first().waitFor()
shots1.elenco = await shoot(page, 'online-elenco')
await page.getByRole('tab', { name: 'Treino', exact: true }).click()
await page.getByRole('button', { name: /Intensa/ }).first().click()
await sleep(1500)
const g1 = await game()
check('o treino Intenso valeu no espelho', g1?.plan?.intensity === 'intense', JSON.stringify(g1?.plan))
shots1.treino = await shoot(page, 'online-treino')
await page.getByRole('tab', { name: 'Base', exact: true }).click()
await sleep(400)
shots1.base = await shoot(page, 'online-base')

// ------------------------------------------------------------------ Tática: muda a formação e confere no servidor reabrindo
await tab('Clube')
await page.getByText('Tática', { exact: true }).first().click()
await sleep(500)
shots1.tatica = await shoot(page, 'online-tatica')
const before = g1.formation
const target = before === '4-3-3' ? '4-4-2' : '4-3-3'
await page.getByRole('button', { name: target, exact: true }).first().click()
await sleep(1500)
const g2 = await game()
check('a tática mudou no espelho', g2.formation === target, `${before} -> ${g2.formation}`)

// ------------------------------------------------------------------ Tabela
await tab('Tabela')
await sleep(600)
shots1.tabela = await shoot(page, 'online-tabela')

// ------------------------------------------------------------------ o servidor guardou: sair e abrir de novo
await tab('Clube')
await page.getByRole('button', { name: 'Menu', exact: true }).click()
await page.getByTestId('online-account').waitFor({ timeout: 30000 })
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByText('Abrir a sala').first().click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
const g3 = await game()
check('depois de sair e voltar, o treino Intenso continua (o servidor guardou)', g3?.plan?.intensity === 'intense', JSON.stringify(g3?.plan))
check('depois de sair e voltar, a tática continua', g3?.formation === target, `${g3?.formation}`)

// ------------------------------------------------------------------ sem conexão: só leitura e ações bloqueadas
await ctx.setOffline(true)
await tab('Elenco')
await page.getByRole('tab', { name: 'Treino', exact: true }).click()
await sleep(7000)
await page.getByTestId('offline-banner').waitFor({ timeout: 20000 }).catch(() => {})
check('sem conexão aparece o aviso', (await page.getByTestId('offline-banner').count()) > 0)
await page.getByRole('button', { name: /Leve/ }).first().click()
await sleep(800)
const g4 = await game()
check('sem conexão a ação é bloqueada e o espelho continua legível', g4?.plan?.intensity === 'intense' && g4.players > 1000, JSON.stringify(g4?.plan))
shots1.offline = await shoot(page, 'online-sem-conexao')
await ctx.setOffline(false)

// ------------------------------------------------------------------ o mesmo, no jogo solo (para comparar lado a lado)
const solo = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const sp = await solo.newPage()
const soloShot = async (query, name) => {
  await sp.goto(`${base}/?time=imp&semente=7&dias=3${query}`)
  await sp.waitForSelector('main', { timeout: 60000 })
  return shoot(sp, `solo-${name}`)
}
const shotsSolo = {
  painel: await soloShot('', 'painel'),
  elenco: await soloShot('&tela=squad', 'elenco'),
  treino: await soloShot('&tela=squad&aba=training', 'treino'),
  base: await soloShot('&tela=squad&aba=academy', 'base'),
  tatica: await soloShot('&tela=tactics', 'tatica'),
  tabela: await soloShot('&tela=standings', 'tabela'),
}

// ------------------------------------------------------------------ lado a lado
const side = await browser.newContext({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 1 })
const sidePage = await side.newPage()
for (const key of Object.keys(shotsSolo)) {
  const a = readFileSync(shotsSolo[key]).toString('base64')
  const b = shots1[key] ? readFileSync(shots1[key]).toString('base64') : null
  if (!b) continue
  await sidePage.setContent(`<body style="margin:0;background:#111;color:#ddd;font:14px sans-serif"><div style="display:flex;gap:12px;padding:8px"><div><div style="padding:4px">Solo</div><img style="width:380px" src="data:image/png;base64,${a}"></div><div><div style="padding:4px">Online</div><img style="width:380px" src="data:image/png;base64,${b}"></div></div></body>`)
  await sidePage.screenshot({ path: resolve(shots, `${prefix}-lado-${key}.png`), fullPage: true })
}
await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
