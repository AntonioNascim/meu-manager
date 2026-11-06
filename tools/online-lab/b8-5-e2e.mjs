// Teste de ponta a ponta da B8.5 (partida ao vivo na tela, por WebSocket), no navegador de verdade, contra o servidor LOCAL (sem custo).
// Cada pessoa é um contexto do navegador. Para a partida não demorar, o servidor local roda com o minuto de jogo curto:
//   cd server && npx wrangler dev --local --port 8787 --var LIVE_MINUTE_MS:600
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-5-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-5'
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

// ------------------------------------------------------------------ o ADM avança: a rodada começa e é ao vivo
await b.getByRole('button', { name: 'Voltar' }).click()
await b.getByText('Abrir a sala').first().click()
await b.getByTestId('calendar').waitFor({ timeout: 30000 })
check('antes da rodada não há botão de entrar na partida', (await b.getByTestId('live-enter').count()) === 0)
// Nem todo clube joga em toda data: se a Bia não joga neste evento, ela NÃO vê o botão (conferido) e o ADM avança para o seguinte.
let skipped = 0
for (let tries = 0; tries < 6; tries++) {
  await a.getByTestId('advance-league').click()
  await a.getByTestId('confirm-advance').click()
  await b.getByTestId('status-event').waitFor({ timeout: 30000 })
  const shown = await b.getByTestId('live-enter').waitFor({ timeout: 7000 }).then(() => true, () => false)
  if (shown) break
  skipped++
  check('quem não joga neste evento não vê "Entrar na partida"', (await b.getByTestId('live-enter').count()) === 0 && (await b.getByText('Seu clube não joga nesta rodada').count()) > 0)
  await a.getByTestId('status-next').waitFor({ timeout: 120000 })
  await b.getByTestId('status-next').waitFor({ timeout: 30000 })
}
await b.getByTestId('live-enter').waitFor({ timeout: 5000 })
check('com a rodada em andamento a Bia vê "Entrar na partida"', true, skipped ? `(${skipped} evento(s) sem jogo dela antes)` : '')
await shoot(b, '01-sala-rodada-em-andamento')

await b.getByTestId('live-enter').click()
await b.getByTestId('live-online').waitFor()
await b.getByTestId('live-score').waitFor({ timeout: 30000 }).catch(async (e) => {
  console.log('  [log do WebSocket]')
  for (const l of wslog.filter((x) => !x.includes('frame')).slice(0, 12)) console.log('   ' + l)
  console.log('  [estado na tela]', (await b.getByTestId('live-online').innerText()).replace(/s+/g, ' ').slice(0, 300))
  throw e
})
check('a tela da partida abre com placar, minuto e campo', (await b.getByTestId('pitch').count()) === 1 && (await b.getByTestId('live-minute').count()) === 1)
const minute = async () => (await b.getByTestId('live-minute').innerText()).trim()
const m0 = await minute()
await waitFor(b, (t) => document.querySelector('[data-testid=live-minute]')?.textContent !== t, m0, 20000)
check('o minuto anda sozinho (o servidor joga)', true, `${m0} → ${await minute()}`)
check('a conexão está "Ao vivo"', (await b.getByTestId('live-online').innerText()).toLowerCase().includes('ao vivo'))
await shoot(b, '02-partida-ao-vivo')

// ------------------------------------------------------------------ comandos do técnico
await b.getByTestId('live-controls').scrollIntoViewIfNeeded()
const offensive = b.getByRole('button', { name: 'Ofensiva', exact: true })
await offensive.click()
await waitFor(b, () => [...document.querySelectorAll('[data-testid=live-controls] button')].some((x) => x.textContent === 'Ofensiva' && x.className.includes('emerald')), undefined, 20000)
check('a mentalidade mudou no servidor e voltou no retrato', true)
await b.getByTestId('live-onpitch').locator('button').nth(5).click()
await b.getByTestId('live-bench').waitFor()
await shoot(b, '03-trocas')
await b.getByTestId('live-bench').locator('button').first().click()
await waitFor(b, () => /Pronto, valeu|Você não|não é permitido|recusad|demorou/i.test(document.querySelector('[data-testid=live-note]')?.textContent ?? ''), undefined, 20000)
check('a troca recebeu resposta do servidor', true, (await b.getByTestId('live-note').innerText()).trim())

// ------------------------------------------------------------------ pausa e retomada com aviso de 10 s
await a.getByTestId('pause-league').click()
await b.getByTestId('live-paused').waitFor({ timeout: 20000 })
check('a pausa do ADM aparece na partida', true)
await shoot(b, '04-partida-pausada')
await a.getByTestId('resume-league').click()
await b.getByTestId('live-resume-warning').waitFor({ timeout: 20000 })
check('ao retomar há o aviso de que o jogo volta em instantes', (await b.getByTestId('live-resume-warning').innerText()).includes('O jogo volta em'))
await shoot(b, '05-aviso-de-retomada')

// ------------------------------------------------------------------ a conexão cai e volta sozinha
const before = tickets.length
sockets.at(-1).close()
await waitFor(b, () => /reconectando|ao vivo/i.test(document.querySelector('[data-testid=live-online]')?.textContent ?? ''), undefined, 10000)
await shoot(b, '06-reconectando')
await waitFor(b, () => document.querySelector('[data-testid=live-online]')?.textContent?.toLowerCase().includes('ao vivo') && !document.querySelector('[data-testid=live-online]')?.textContent?.toLowerCase().includes('reconectando'), undefined, 30000)
check('a conexão caiu e voltou sozinha com ticket novo', tickets.length > before && new Set(tickets).size === tickets.length)
check('depois de reconectar a partida continua (placar e minuto na tela)', (await b.getByTestId('live-minute').count()) === 1)

// ------------------------------------------------------------------ ticket é de uso único; ticket falso não entra
const tryOpen = (target) =>
  b.evaluate(
    (u) =>
      new Promise((res) => {
        const ws = new WebSocket(u)
        ws.onopen = () => (ws.close(), res('abriu'))
        ws.onclose = () => res('recusou')
        setTimeout(() => res('tempo'), 8000)
      }),
    target,
  )
const reqUrl = sockets.length ? sockets[0].url() : ''
const live = reqUrl.replace(/ticket=[0-9a-f]+/, '')
probing = true
const spent = /ticket=([0-9a-f]+)/.exec(reqUrl)?.[1] // o ticket que a primeira conexão gastou
const used = await tryOpen(`${live}ticket=${spent}`)
check('um ticket já usado não abre outra conexão', used === 'recusou', used)
const fake = await tryOpen(`${live}ticket=${'0'.repeat(48)}`)
check('um ticket inventado não abre conexão', fake === 'recusou', fake)
probing = false

// ------------------------------------------------------------------ o fim da partida
await waitFor(b, () => document.querySelector('[data-testid=live-minute]')?.textContent?.includes('Fim de jogo'), undefined, 120000).catch(async (e) => {
  console.log('  [log do WebSocket]')
  for (const l of wslog.slice(-40)) console.log('   ' + l)
  console.log('  [estado na tela]', (await b.getByTestId('live-online').innerText()).replace(/\s+/g, ' ').slice(0, 300))
  throw e
})
check('a partida termina e mostra "Fim de jogo"', true, (await b.getByTestId('live-result').innerText()).trim())
await waitFor(b, () => document.querySelector('[data-testid=live-online]')?.textContent?.toLowerCase().includes('rodada encerrada'), undefined, 30000)
await shoot(b, '07-fim-de-jogo')
await b.getByTestId('live-back').click()
await b.getByTestId('status-next').waitFor({ timeout: 30000 })
check('ao voltar, a sala mostra a próxima rodada', true)
await shoot(b, '08-sala-depois-da-rodada')

console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)
