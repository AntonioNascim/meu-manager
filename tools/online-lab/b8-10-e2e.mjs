// Teste de ponta a ponta da pendência 2 (partida ao vivo online: escolher quem entra na lesão e arrastar jogadores), no navegador de verdade, contra o servidor LOCAL (sem custo).
// Cada pessoa é um contexto do navegador. Para a partida não demorar, o servidor local roda com o minuto de jogo curto:
//   cd server && npx wrangler dev --local --port 8787 --var LIVE_MINUTE_MS:600 --var LIVE_INJURY_RATE:60
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 4173 --strictPort
//   cd tools/online-lab && node b8-10-e2e.mjs [http://localhost:4173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const prefix = process.argv[3] ?? 'b8-10'
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
const shoot = async (page, name) => {
  await sleep(300)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const waitFor = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout })
const pickClub = async (page, n) => {
  await page.getByTestId('pick-club').click()
  await page.getByTestId('club-list').waitFor({ timeout: 60000 })
  await page.locator('[data-testid^=club-team-]:not([disabled])').nth(n).click()
  await page.getByRole('button', { name: 'Assumir este clube' }).click()
}

// ------------------------------------------------------------------ liga ao vivo com dois técnicos
const ana = await person('Ana Treinadora')
const a = ana.page
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(`Liga Ao Vivo ${rnd()}`)
await a.getByRole('button', { name: 'Assistir ao vivo' }).click()
for (let i = 0; i < 5; i++) await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
await pickClub(a, 0)
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()

a.on('websocket', (w) => console.log('  [WS da Ana]', w.url().slice(0, 90)))
const bia = await person('Bia Craque')
const b = bia.page
await b.getByRole('button', { name: 'Ligas online' }).click()
await b.getByRole('button', { name: 'Entrar com um código de convite' }).click()
await b.getByTestId('invite-code').fill(code)
await b.getByRole('button', { name: 'Procurar a liga' }).click()
await pickClub(b, 1)
await b.getByTestId('members').getByText('Bia Craque').waitFor()

// O ticket e o WebSocket da Bia passam por aqui: guardamos os tickets e damos um jeito de derrubar a conexão.
const tickets = []
b.on('response', async (res) => {
  if (res.url().endsWith('/live-ticket') && res.status() === 200) tickets.push((await res.json()).ticket)
})
const sockets = []
const wslog = []
let probing = false
const t0 = Date.now()
await b.routeWebSocket(/\/live/, (ws) => {
  const server = ws.connectToServer()
  if (probing) return
  sockets.push(ws)
  const n = sockets.length
  wslog.push(`+${Date.now() - t0}ms socket#${n} aberto`)
  server.onMessage((m) => {
    try {
      const j = JSON.parse(String(m))
      wslog.push(`+${Date.now() - t0}ms #${n} <- ${j.t}${j.minute !== undefined ? ' min ' + j.minute : ''}`)
      if (j.t === 'frame' && j.games.some((g) => g.injury)) wslog.push(`   LESÃO: ${JSON.stringify(j.games.map((g) => g.injury))} controlled=${JSON.stringify(j.games.map((g) => g.controlled))}`)
      if (j.t === 'full') wslog.push(`   full: me=${JSON.stringify(j.me)} jogos=${j.games.map((g) => g.snapshot.home.teamId + ' x ' + g.snapshot.away.teamId).join(' | ')} times=${j.roster.teams.length} jogadores=${j.roster.players.length}`)
    } catch {
      /* ignora */
    }
    ws.send(m)
  })
  ws.onMessage((m) => {
    wslog.push(`+${Date.now() - t0}ms #${n} -> ${String(m).slice(0, 60)}`)
    server.send(m)
  })
  ws.onClose((code, reason) => {
    wslog.push(`+${Date.now() - t0}ms #${n} fechado (cliente)`)
    server.close({ code: code ?? 1000, reason })
  })
  server.onClose((code, reason) => {
    wslog.push(`+${Date.now() - t0}ms #${n} fechado (servidor) ${code} ${reason ?? ''}`)
    ws.close({ code: code ?? 1000, reason })
  })
})

await a.reload()
await a.getByTestId('online-account').waitFor()
await a.getByRole('button', { name: 'Ligas online' }).click()
await a.getByText('Abrir a sala').first().click()
await a.getByTestId('start-league').click()
await a.getByTestId('status-next').waitFor({ timeout: 60000 })

// ------------------------------------------------------------------ o ADM avança até uma rodada em que a Bia joga
await b.getByRole('button', { name: 'Voltar' }).click()
await b.getByText('Abrir a sala').first().click()
await b.getByTestId('calendar').waitFor({ timeout: 30000 })
for (let tries = 0; tries < 6; tries++) {
  await a.getByTestId('advance-league').click()
  await a.getByTestId('confirm-advance').click()
  await b.getByTestId('status-event').waitFor({ timeout: 30000 })
  const shown = await b.getByTestId('live-enter').waitFor({ timeout: 7000 }).then(() => true, () => false)
  if (shown) break
  await a.getByTestId('status-next').waitFor({ timeout: 100000 }).catch(async () => { console.log('  [Ana]', (await a.locator('body').innerText()).replace(/s+/g, ' ').slice(0, 700)); console.log('  [Bia]', (await b.locator('body').innerText()).replace(/s+/g, ' ').slice(0, 400)); throw new Error('evento não terminou') })
  await b.getByTestId('status-next').waitFor({ timeout: 30000 })
}
await b.getByTestId('live-enter').waitFor({ timeout: 5000 })
await b.getByTestId('live-enter').click()
await b.getByTestId('live-online').waitFor()
await b.getByTestId('live-score').waitFor({ timeout: 30000 })
// Ana entra na mesma partida (se jogam um contra o outro) para que a lesão sempre tenha um técnico presente.
const aEnter = await a.getByTestId('live-enter').waitFor({ timeout: 5000 }).then(() => true, () => false)
if (aEnter) {
  await a.getByTestId('live-enter').click()
  await a.getByTestId('live-score').waitFor({ timeout: 30000 })
}
const pages = aEnter ? [b, a] : [b]

// ------------------------------------------------------------------ lesão: o jogo para e o técnico escolhe quem entra
let hurtPage = null
for (let i = 0; i < 80 && !hurtPage; i++) {
  for (const p of pages) if ((await p.getByTestId('live-injury').count()) > 0) hurtPage = p
  if (!hurtPage) await sleep(500)
}
check('a lesão aparece para o técnico com a escolha do reserva', !!hurtPage)
if (!hurtPage) {
  for (const l of wslog.slice(-14)) console.log('   ' + l)
  for (const p of pages) console.log('  [tela]', (await p.getByTestId('live-online').innerText()).replace(/\s+/g, ' ').slice(0, 900))
  console.log('\nSem lesão provocada: abortando.')
  await browser.close()
  process.exit(1)
}
const h = hurtPage
await h.getByTestId('live-injury').scrollIntoViewIfNeeded()
await shoot(h, '01-lesao-escolha')
const minuteOf = async () => (await h.getByTestId('live-minute').innerText()).trim()
const stopped = await minuteOf()
await sleep(4000)
check('o jogo dele fica parado enquanto espera a escolha', (await minuteOf()) === stopped, stopped)
check('a contagem de 45 s aparece', /entra o melhor reserva em \d+ s/.test(await h.getByTestId('live-injury-left').innerText()))
const bench = h.getByTestId('live-bench').locator('button')
check('o banco aparece para escolher', (await bench.count()) > 0, `${await bench.count()} reservas`)
await bench.first().click()
await h.getByTestId('live-injury').waitFor({ state: 'detached', timeout: 20000 })
check('depois da escolha o aviso some e o reserva entra', true)
await waitFor(h, (t) => document.querySelector('[data-testid=live-minute]')?.textContent !== t, stopped, 20000)
check('o jogo volta a andar', true, `${stopped} → ${await minuteOf()}`)
await shoot(h, '02-lesao-resolvida')

// ------------------------------------------------------------------ arrastar um jogador no campo
await h.getByTestId('field-lineup').scrollIntoViewIfNeeded()
const field = h.getByTestId('field-lineup')
const box = await field.boundingBox()
const tokens = field.locator('[data-player]')
const count = await tokens.count()
check('o campo mostra os jogadores arrastáveis', count >= 8, `${count} jogadores`)
// o jogador mais à frente e à esquerda do meio (o 6º botão é um meio-campista na maioria das formações)
const mover = tokens.nth(6)
const mb = await mover.boundingBox()
const before = { x: mb.x + mb.width / 2, y: mb.y + mb.height / 2 }
await shoot(h, '03-campo-antes-de-arrastar')
await h.mouse.move(before.x, before.y)
await h.mouse.down()
await h.mouse.move(before.x + 20, before.y - 20, { steps: 4 })
await shoot(h, '04-arrastando')
await h.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.22, { steps: 12 })
await h.mouse.up()
await h.getByTestId('live-note').waitFor({ timeout: 10000 })
check('o servidor aceitou a mudança de posição ("Pronto, valeu")', await h.waitForFunction(() => /Pronto, valeu/.test(document.querySelector('[data-testid=live-note]')?.textContent ?? ''), undefined, { timeout: 25000 }).then(() => true, () => false))
const after = await mover.boundingBox().catch(() => null)
check('o jogador está em outro lugar do campo', !!after && (Math.abs(after.x - mb.x) > 8 || Math.abs(after.y - mb.y) > 8), after ? `${Math.round(mb.x)},${Math.round(mb.y)} → ${Math.round(after.x)},${Math.round(after.y)}` : 'sumiu')
await shoot(h, '05-campo-depois-de-arrastar')

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
