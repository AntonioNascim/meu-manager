// Teste de ponta a ponta da Fase 6C (C6): vender em sequência a clubes da IA, lesão repetida na partida, queda de conexão com ticket novo, favoritos e escalações
// por conta, carreira e espelho guardado no aparelho. Navegador de verdade contra o servidor LOCAL (sem custo). O servidor roda com lesões frequentes:
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787 --var LIVE_INJURY_RATE:60
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c6-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'c6'
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
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const closeOverlays = async () => {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape')
    const close = page.getByRole('button', { name: 'Fechar', exact: true }).last()
    if (await close.isVisible().catch(() => false)) await close.click()
    await sleep(150)
  }
}
const squadSize = () => page.evaluate(() => { const g = window.__mm.getGame(); return g.season.players.filter((p) => p.teamId === g.userTeamId).length })

// ------------------------------------------------------------------ conta, liga ao vivo, clube e jogo aberto
// Os tickets do WebSocket da partida e as conexões, para provar a reconexão com ticket novo.
const tickets = []
page.on('response', async (res) => {
  if (res.url().endsWith('/live-ticket') && res.status() === 200) tickets.push((await res.json()).ticket)
})
page.on('response', (res) => {
  const u = res.url()
  if (u.includes('/detail') || u.includes('/prefs') || u.includes('/dismissal') || u.includes('/career') || (u.includes('/mirror') && res.status() >= 400)) console.log('  [rede]', res.status(), u.split('/api/leagues/')[1]?.replace(/^[^/]+/, ''))
})
const sockets = []
await page.routeWebSocket(/\/live/, (ws) => {
  const server = ws.connectToServer()
  sockets.push(ws)
  server.onMessage((m) => ws.send(m))
  ws.onMessage((m) => server.send(m))
  ws.onClose(() => server.close())
  server.onClose(() => ws.close())
})
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Treinadora')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga C6 ${rnd()}`)
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

// ------------------------------------------------------------------ compradores em sequência (vender a clubes da IA, um depois do outro)
const sellOne = async (skip, exclude) => {
  await page.getByRole('button', { name: /^Elenco/ }).first().click()
  await page.getByRole('tab', { name: 'Jogadores', exact: true }).click()
  await sleep(500)
  // Procura um jogador e um clube da IA que fechem negócio (a IA recusa, por exemplo, quem ficaria sem reposição na posição: a regra é a do solo).
  for (let i = skip; i < skip + 29; i++) {
    await page.locator('main ul li button').nth(i).click()
    await page.getByRole('button', { name: 'Vender, emprestar ou liberar' }).click()
    const select = page.locator('select').last()
    await select.waitFor()
    const options = await select.locator('option').allInnerTexts()
    const picks = options.map((o, k) => k).filter((k) => k > 0 && (!exclude || !options[k].startsWith(exclude))).slice(0, 6)
    for (const pick of picks) {
      await select.selectOption({ index: pick })
      const before = await squadSize()
      await page.getByRole('button', { name: 'Vender', exact: true }).last().click()
      await sleep(2000)
      if ((await squadSize()) < before) {
        await closeOverlays()
        return options[pick]
      }
    }
    await page.keyboard.press('Escape')
    { const close = page.getByRole('button', { name: 'Fechar', exact: true }).last(); if (await close.isVisible().catch(() => false)) await close.click() }
    await sleep(200)
  }
  return null
}
const s0 = await squadSize()
const b1 = await sellOne(0)
await sleep(800)
const s1 = await squadSize()
const b2 = await sellOne(0, b1 ? b1.split(' · ')[0] : undefined)
await sleep(800)
const s2 = await squadSize()
check('o primeiro comprador da IA levou o jogador (o servidor aceitou)', s1 === s0 - 1 && b1 !== null, `${s0} -> ${s1} (${b1})`)
check('o segundo comprador, em sequência, levou o outro (clubes diferentes)', s2 === s1 - 1 && b2 !== null, `${s1} -> ${s2} (${b2})`)
check('os dois compradores eram clubes diferentes', b1 !== null && b2 !== null && b1 !== b2, `${b1} | ${b2}`)

// ------------------------------------------------------------------ favoritos por conta
await page.getByRole('button', { name: /^Mercado/ }).first().click()
await page.getByRole('tab', { name: 'Buscar', exact: true }).click()
await sleep(600)
await page.locator('main ul li').first().locator('button').last().click()
await sleep(2500)
const favs = await page.evaluate(() => window.__mm.getGame().favorites?.length ?? 0)
check('a estrela marcou um favorito', favs === 1, `${favs}`)

// ------------------------------------------------------------------ rodada ao vivo com lesões repetidas e queda de conexão
let watching = false
for (let tries = 0; tries < 8 && !watching; tries++) {
  await page.getByRole('button', { name: 'Clube', exact: true }).first().click()
  await page.getByRole('button', { name: /^ADM/ }).click()
  await page.getByTestId('advance-league').click()
  await page.getByTestId('confirm-action').click()
  await page.getByRole('button', { name: 'Clube', exact: true }).first().click()
  // Avançar só abre a sala ("Jogo pronto · Agora"): a partida espera o Pronto e abre sozinha na tela depois dele.
  const ready = await page.getByTestId('league-ready').waitFor({ timeout: 10000 }).then(() => true, () => false)
  if (ready) {
    await page.getByTestId('league-ready-counter').waitFor({ timeout: 20000 })
    check('o cartão mostra "Jogo pronto · Agora" e o contador antes de a partida começar', (await page.getByTestId('league-status').innerText()).includes('Jogo pronto') && (await page.getByTestId('league-ready-counter').innerText()).includes('Pronto 0/'))
    await page.getByTestId('league-ready').click()
    watching = await page.getByTestId('speed').waitFor({ timeout: 40000 }).then(() => true, () => false)
  } else {
    await page.getByTestId('league-open-room').click()
    await page.getByTestId('status-next').waitFor({ timeout: 180000 })
  }
}
check('depois do Pronto a partida abre sozinha na tela', watching)
await page.getByTestId('speed').waitFor({ timeout: 40000 })
await page.getByTestId('speed').click()
await page.getByTestId('speed').click()
await page.getByTestId('speed').click()
const ticketsBefore = tickets.length
let injuries = 0
const hurtSeen = new Set()
let dropped = false
const end = Date.now() + 240000
while (Date.now() < end) {
  if (await page.getByRole('button', { name: 'Voltar ao painel' }).isVisible().catch(() => false)) break
  if (await page.getByTestId('halftime-back').isVisible().catch(() => false)) await page.getByTestId('halftime-back').click().catch(() => {})
  const hurt = await page.getByText('Banco (toque em quem entra)').isVisible().catch(() => false)
  const alertText = await page.getByRole('alert').first().innerText().catch(() => '')
  if (/Escolha quem entra|Toque em quem entra/.test(alertText + (await page.locator('main').innerText().catch(() => '')).slice(0, 4000)) && hurt) {
    const bench = page.getByText('Banco (toque em quem entra)').locator('xpath=ancestor::*[self::section or self::div][1]').locator('button:not([disabled])').first()
    const less = page.getByRole('button', { name: 'Seguir com um a menos' })
    if (!(await bench.isVisible().catch(() => false)) && (await less.isVisible().catch(() => false))) await less.click().catch(() => {})
    if (await bench.isVisible().catch(() => false)) {
      const hurtText = alertText + ' ' + (await page.locator('main').innerText().catch(() => ''))
      const who = (/(\S+(?: \S+)?) se machucou/.exec(hurtText) ?? [])[1] ?? ''
      await bench.click().catch(() => {})
      if (who && !hurtSeen.has(who)) {
        hurtSeen.add(who)
        injuries++
      }
      await sleep(1500)
    }
  }
  // Com a partida andando, derruba a conexão uma vez: tem de voltar sozinha, com ticket novo.
  if (!dropped && injuries >= 1 && sockets.length > 0) {
    dropped = true
    sockets.at(-1).close()
    await sleep(6000)
  }
  await sleep(700)
}
check('houve lesão mais de uma vez e o técnico escolheu quem entra (jogadores diferentes)', injuries >= 2, `${injuries} lesões resolvidas pelo banco: ${[...hurtSeen].join(', ')}`)
check('a conexão caiu e voltou sozinha com ticket novo (cada ticket só vale uma vez)', dropped && tickets.length > ticketsBefore && new Set(tickets).size === tickets.length, `${tickets.length - ticketsBefore} ticket(s) novo(s)`)
check('a partida terminou depois de tudo isso', await page.getByRole('button', { name: 'Voltar ao painel' }).isVisible().catch(() => false))
await shoot('partida-fim')
await page.getByRole('button', { name: 'Voltar ao painel' }).click()
await page.getByTestId('league-card').waitFor()

// ------------------------------------------------------------------ carreira
await page.getByTestId('league-career').click()
await page.getByTestId('online-career').waitFor({ timeout: 15000 })
check('a aba Carreira mostra o histórico (o clube atual, até hoje)', (await page.getByTestId('online-career').innerText()).includes('até hoje'))
await shoot('carreira')

// ------------------------------------------------------------------ detalhe ao tocar: condição real de outro clube depois da rodada
await page.getByRole('button', { name: /^Clube/ }).first().click()
await sleep(800)
const next = await page.evaluate(() => {
  const g = window.__mm.getGame()
  const m = g.season.matches.filter((x) => x.status === 'scheduled' && (x.homeTeamId === g.userTeamId || x.awayTeamId === g.userTeamId)).sort((x, y) => x.date.localeCompare(y.date))[0]
  return m.homeTeamId === g.userTeamId ? m.awayTeamId : m.homeTeamId
})
await page.getByRole('button', { name: 'Ver tática e escalação provável' }).click()
await sleep(3000)
await shoot('adversario')
const tired = await page.evaluate((id) => window.__mm.getGame().season.players.filter((p) => p.teamId === id).some((p) => p.condition.fitness < 100), next)
check('ao abrir a página do adversário a condição física real chega (não só 100)', tired)

await closeOverlays()
{ const back = page.getByRole('button', { name: /Voltar|Fechar/ }).first(); if (await back.isVisible().catch(() => false)) await back.click() }
// ------------------------------------------------------------------ sair e voltar: favoritos da conta e espelho guardado no aparelho
await page.getByRole('button', { name: 'Menu', exact: true }).click()
await page.getByTestId('online-account').waitFor({ timeout: 30000 })
const cached = await page.evaluate(async () => {
  const dbs = await indexedDB.databases()
  return dbs.some((d) => d.name === 'meu-manager-espelho')
})
check('o espelho ficou guardado no aparelho (banco próprio)', cached)
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByText('Abrir a sala').first().click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 60000 }).catch(async (e) => {
  await shoot('debug-reabrir')
  throw e
})
await page.waitForFunction(() => (window.__mm.getGame()?.favorites?.length ?? 0) > 0, undefined, { timeout: 15000 }).catch(() => {})
const favs2 = await page.evaluate(() => window.__mm.getGame().favorites?.length ?? 0)
check('os favoritos vieram da conta ao reabrir', favs2 === 1, `${favs2}`)

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
