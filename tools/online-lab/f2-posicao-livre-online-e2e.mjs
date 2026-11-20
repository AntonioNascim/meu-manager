// Posicionamento livre na liga online, no navegador de verdade, contra o servidor LOCAL (sem custo):
// solta um titular fora da grade, confere que o servidor guardou (o espelho volta igual ao sair e entrar) e que a posição solta, a grade que o
// motor lê e o papel mostrado continuam coerentes.
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node f2-posicao-livre-online-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
// Capturas de 380 px em .shots/.
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'f2'
const shots = resolve('../../.shots')
let failed = 0
// As falhas também saem num resumo no fim do log (para copiar só o que importa).
const failures = []
process.on('exit', () => {
  if (failures.length > 0) console.log(`\nRESUMO DAS FALHAS (${failures.length}):\n${failures.join('\n')}`)
})
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) {
    failed++
    failures.push(`FALHA ${name}${extra ? '  ' + extra : ''}`)
  }
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
const shoot = async (name) => {
  await sleep(500)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const tab = async (name) => page.getByRole('button', { name, exact: true }).first().click()
/** A tática do clube do técnico como o aparelho a vê (o espelho do servidor). */
const tacticNow = () =>
  page.evaluate(() => {
    const g = window.__mm.getGame()
    const t = g.season.teams.find((x) => x.id === g.userTeamId).tactic
    return { startingXI: t.startingXI, grid: t.grid ?? null, spots: t.spots ?? null, formationId: t.formationId }
  })

// ------------------------------------------------------------------ conta, liga, clube, abrir o jogo
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Posicao')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Posicao ${rnd()}`)
await page.getByRole('button', { name: 'Resultado direto' }).click()
for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Menos' }).click()
await page.getByRole('button', { name: 'Criar a liga' }).click()
await page.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
await page.getByTestId('pick-club').click()
await page.getByTestId('club-list').waitFor({ timeout: 60000 })
await page.locator('[data-testid^=club-team-]:not([disabled])').nth(0).click()
await page.getByRole('button', { name: 'Assumir este clube' }).click()
await page.getByTestId('members').getByText('Ana Posicao').waitFor()
await page.getByTestId('start-league').click()
await page.getByTestId('status-next').waitFor({ timeout: 60000 })
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })

const t0 = await tacticNow()
check('o jogo online abre com a tática do clube e sem pontos livres', t0.startingXI.length === 11 && t0.spots === null)

// ------------------------------------------------------------------ solta um titular fora da grade
await tab('Elenco')
await page.getByRole('tab', { name: 'Time principal', exact: true }).click()
const field = page.locator('[data-testid="grid-pitch"]').first()
await field.waitFor({ timeout: 30000 })
await field.evaluate((el) => el.scrollIntoView({ block: 'start' }))
await page.evaluate(() => window.scrollBy(0, -70))
await sleep(400)
const box = await field.boundingBox()
const tokens = page.locator('[data-player]')
check('11 titulares no campo', (await tokens.count()) === 11)
const token = tokens.nth(5)
const id = await token.getAttribute('data-player')
const from = await token.boundingBox()
const target = { x: box.x + box.width * 0.41, y: box.y + box.height * 0.385 }
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
await page.mouse.down()
await page.mouse.move(target.x, target.y, { steps: 12 })
await page.mouse.up()
await sleep(2500)

const after = await page.locator(`[data-player="${id}"]`).boundingBox()
check('o jogador fica onde foi solto (x)', Math.abs(after.x + after.width / 2 - target.x) < 6, `${(after.x + after.width / 2).toFixed(1)} vs ${target.x.toFixed(1)}`)
check('o jogador fica onde foi solto (y)', Math.abs(after.y + after.height / 2 - target.y) < 6, `${(after.y + after.height / 2).toFixed(1)} vs ${target.y.toFixed(1)}`)
check('o cartão mostra o papel que o motor entendeu', (await page.locator('[data-testid="role-card"]').innerText()).includes('O motor entende'))
await shoot('solto')

let t1 = await tacticNow()
const i = t1.startingXI.indexOf(id)
check('o servidor aceitou: o espelho tem os pontos livres do clube', Array.isArray(t1.spots) && t1.spots.length === 11, JSON.stringify(t1.spots?.[i]))
check('o ponto guardado é onde o jogador foi solto (41% da largura, 38,5% da altura)', !!t1.spots?.[i] && Math.abs(t1.spots[i].x - 41) < 3 && Math.abs(t1.spots[i].y - 38.5) < 3, JSON.stringify(t1.spots?.[i]))
check('a grade que o motor lê continua com 11 pontos diferentes', t1.grid && new Set(t1.grid.map((p) => `${p.row}.${p.lane}`)).size === 11)
check('os mesmos 11 titulares', JSON.stringify(t1.startingXI) === JSON.stringify(t0.startingXI))

// ------------------------------------------------------------------ vários jogadores mexidos em seguida: sem erro, comandos juntados, tudo guardado
const commands = []
page.on('request', (req) => {
  if (req.method() === 'POST' && /\/command$/.test(new URL(req.url()).pathname)) commands.push(Date.now())
})
const dist = (a, b) => Math.hypot(((a.x - b.x) / 100) * 3, ((a.y - b.y) / 100) * 5.1)
const LANES = [14, 32, 50, 68, 86]
const ROWS = [91, 75, 59, 46, 33, 16]
const current = (t) => t.startingXI.map((_, k) => t.spots?.[k] ?? { x: LANES[t.grid[k].lane], y: ROWS[t.grid[k].row] })
const occupied = current(t1)
const targets = []
for (const y of [28, 40, 52, 66, 22, 58]) {
  for (const x of [22, 42, 62, 80, 30, 70]) {
    const c = { x, y }
    if (targets.length < 4 && occupied.every((o) => dist(o, c) > 0.5) && targets.every((o) => dist(o, c) > 0.5)) targets.push(c)
  }
}
check('achou 4 pontos livres no campo para mexer', targets.length === 4, JSON.stringify(targets))
const movedIds = []
const before = commands.length
await field.evaluate((el) => el.scrollIntoView({ block: 'start' }))
await page.evaluate(() => window.scrollBy(0, -70))
await sleep(300)
const box3 = await field.boundingBox()
for (let n = 0; n < 4; n++) {
  const tk = tokens.nth(6 + n)
  movedIds.push(await tk.getAttribute('data-player'))
  const fb = await tk.boundingBox()
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
  await page.mouse.down()
  await page.mouse.move(box3.x + (box3.width * targets[n].x) / 100, box3.y + (box3.height * targets[n].y) / 100, { steps: 6 })
  await page.mouse.up()
}
await sleep(3500)
const sent = commands.length - before
const errorTexts = await page.getByText(/O servidor não respondeu|não entendeu o pedido|Muitas ações seguidas/).count()
check('nenhum erro vermelho apareceu ao mexer vários jogadores', errorTexts === 0, String(errorTexts))
check('os arrastos seguidos foram juntados em menos comandos que arrastos', sent >= 1 && sent < 4, `${sent} comando(s) para 4 arrastos`)
const t1b = await tacticNow()
let allThere = true
movedIds.forEach((pid, n) => {
  const k = t1b.startingXI.indexOf(pid)
  const s = t1b.spots?.[k]
  if (!s || Math.abs(s.x - targets[n].x) > 3 || Math.abs(s.y - targets[n].y) > 3) allThere = false
})
check('o espelho tem os 4 jogadores onde foram soltos (o servidor aceitou tudo)', allThere, JSON.stringify(movedIds.map((pid) => t1b.spots?.[t1b.startingXI.indexOf(pid)])))
check('o primeiro jogador mexido continua onde estava', Math.abs((t1b.spots?.[i]?.x ?? 0) - 41) < 3 && Math.abs((t1b.spots?.[i]?.y ?? 0) - 38.5) < 3)
check('os mesmos 11 titulares e 11 pontos diferentes na grade', JSON.stringify(t1b.startingXI) === JSON.stringify(t0.startingXI) && new Set(t1b.grid.map((p) => `${p.row}.${p.lane}`)).size === 11)
await shoot('varios-jogadores')
t1 = t1b

// ------------------------------------------------------------------ o servidor guardou: sair e voltar
await tab('Início')
await page.getByRole('button', { name: 'Mais', exact: true }).click()
await page.getByRole('button', { name: 'Menu · salvar e voltar ao início' }).click()
await page.getByTestId('online-account').waitFor({ timeout: 30000 })
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByText('Abrir a sala').first().click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
const t2 = await tacticNow()
check('depois de sair e voltar, os pontos livres continuam iguais', JSON.stringify(t2.spots) === JSON.stringify(t1.spots), JSON.stringify(t2.spots?.[i]))
check('depois de sair e voltar, a grade continua igual', JSON.stringify(t2.grid) === JSON.stringify(t1.grid))

await tab('Elenco')
await page.getByRole('tab', { name: 'Time principal', exact: true }).click()
await field.waitFor({ timeout: 30000 })
await field.evaluate((el) => el.scrollIntoView({ block: 'start' }))
await page.evaluate(() => window.scrollBy(0, -70))
await sleep(500)
const box2 = await field.boundingBox()
const back = await page.locator(`[data-player="${id}"]`).boundingBox()
const rel = { x: (back.x + back.width / 2 - box2.x) / box2.width, y: (back.y + back.height / 2 - box2.y) / box2.height }
check('na tela o jogador volta onde foi solto (x)', Math.abs(rel.x - 0.41) < 0.03, rel.x.toFixed(3))
check('na tela o jogador volta onde foi solto (y)', Math.abs(rel.y - 0.385) < 0.03, rel.y.toFixed(3))
await shoot('depois-de-voltar')

// ------------------------------------------------------------------ "Livre" some se o técnico voltar a uma formação pronta
const other = t1.formationId === '4-3-3' ? '4-4-2' : '4-3-3'
await page.getByRole('button', { name: other, exact: true }).first().click()
await sleep(2500)
const t3 = await tacticNow()
check('trocar para uma formação pronta tira os pontos livres (no servidor também)', t3.spots === null)

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
