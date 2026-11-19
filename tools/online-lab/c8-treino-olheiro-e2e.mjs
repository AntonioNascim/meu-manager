// Teste de ponta a ponta (estudo do concorrente, Partes 2 a 5): pré-temporada, agenda de treino por dia e olheiro, na liga online, no navegador de verdade, contra o servidor LOCAL (sem custo).
//   cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c8-treino-olheiro-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
// Confere: delegar a semana à comissão, dar folga num dia, trocar a intensidade do dia, o campinho animado (22 jogadores se mexendo), o espelho e o servidor
// (sair e voltar), a escolha do olheiro (vale só no mês seguinte) e a leitura do adversário por nível. Capturas de 380 px em .shots/.
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'c8'
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
const shoot = async (name) => {
  await sleep(500)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const state = () =>
  page.evaluate(() => {
    const g = window.__mm.getGame()
    if (!g) return null
    const t = g.season.teams.find((x) => x.id === g.userTeamId)
    const agenda = g.season.training.agenda?.[g.userTeamId] ?? {}
    return { agenda, days: Object.keys(agenda).length, drills: Object.values(agenda).map((s) => s.drill), scouting: t.scouting ?? null, preseason: t.preseason ?? null, promise: t.promise ?? null, sponsor: t.sponsor ?? 1, bet: t.bet ?? null, balance: t.finances.balance, date: g.season.season.currentDate }
  })
const tab = async (name) => page.getByRole('button', { name, exact: true }).first().click()

// ------------------------------------------------------------------ conta, liga, clube, abrir o jogo
await page.goto(base)
await page.getByRole('button', { name: 'Criar minha conta online' }).click()
await page.getByTestId('age-18+').check()
await page.getByTestId('nickname-input').fill('Ana Treinadora')
await page.getByRole('button', { name: 'Criar conta' }).click()
await page.getByTestId('online-account').waitFor()
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByRole('button', { name: 'Criar uma liga' }).click()
await page.getByTestId('league-name').fill(`Liga Treino ${rnd()}`)
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
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
check('o jogo online abre com o espelho do mundo', !!(await state()))

// ------------------------------------------------------------------ coletiva de apresentação (promessa na diretoria)
await page.getByTestId('press-card').waitFor({ timeout: 30000 })
await page.getByTestId('press-open').click()
await page.locator('[data-kind="title"]').click()
await sleep(1500)
const pr = await state()
check('a promessa da coletiva valeu no servidor (lutar pelo título)', pr.promise?.kind === 'title', JSON.stringify(pr.promise))
check('depois de responder o cartão da coletiva some', (await page.getByTestId('press-card').count()) === 0)

// ------------------------------------------------------------------ agenda de treino
await tab('Elenco')
await page.getByRole('tab', { name: 'Treino', exact: true }).click()
// ------------------------------------------------------------------ pré-temporada (o mundo da liga começa antes do primeiro jogo)
await page.getByTestId('preseason-wizard').waitFor({ timeout: 30000 })
check('o assistente de pré-temporada aparece com 3 locais', (await page.getByTestId('preseason-place').count()) === 3)
const caixa0 = (await state()).balance
await page.locator('[data-testid=preseason-place][data-place="country"]').click()
await page.getByTestId('preseason-opponent').nth(0).click()
await page.getByTestId('preseason-opponent').nth(1).click()
await shoot('preseason-assistente')
await page.getByTestId('preseason-confirm').click()
await page.getByTestId('preseason-summary').waitFor({ timeout: 30000 })
const p1 = await state()
check('a pré-temporada valeu no espelho (praça do país, 2 amistosos)', p1.preseason?.place === 'country' && p1.preseason?.friendlies?.length === 2, JSON.stringify(p1.preseason?.place))
check('o custo do local saiu do caixa', p1.balance < caixa0, `${caixa0} -> ${p1.balance}`)
check('o resumo lista os 2 amistosos a jogar', (await page.getByTestId('friendly').count()) === 2)
await shoot('preseason-resumo')
await page.getByTestId('training-week').waitFor({ timeout: 30000 })
const nDays = await page.getByTestId('training-day').count()
check('a semana de treino mostra os dias até o primeiro jogo', nDays >= 1 && nDays <= 7, `${nDays} dias`)
check('o campinho está na tela', (await page.getByTestId('training-field').count()) === 1)
await shoot('treino-semana-vazia')
const s0 = await state()
check('no começo não há agenda', s0.days === 0)

await page.getByTestId('training-delegate').click()
await sleep(2000)
const s1 = await state()
check('"Delegar à comissão" montou a semana no espelho (o servidor aceitou)', s1.days === nDays, JSON.stringify(s1.drills))
check('a véspera do jogo é bola parada leve', s1.drills.at(-1) === 'corners-for')
await shoot('treino-delegada')

// escolhe um jogo reduzido no primeiro dia e confere o campinho se mexendo
await page.getByTestId('training-day').first().click()
await page.getByRole('tab', { name: 'Jogos reduzidos' }).click()
await page.locator('[data-drill="full-match"]').click()
await sleep(1500)
const s2 = await state()
check('o exercício escolhido entrou na agenda do dia', s2.drills[0] === 'full-match', JSON.stringify(s2.drills))
const motion = await page.evaluate(
  () =>
    new Promise((res) => {
      const gs = [...document.querySelectorAll('[data-testid=training-field] svg g[data-side]')]
      let prev = gs.map((g) => g.getAttribute('transform'))
      let frames = 0
      let moved = 0
      const t0 = performance.now()
      const loop = (t) => {
        frames++
        const cur = gs.map((g) => g.getAttribute('transform'))
        if (cur.some((v, i) => v !== prev[i])) moved++
        prev = cur
        if (t - t0 < 3000) requestAnimationFrame(loop)
        else res({ bodies: gs.length, frames, moved })
      }
      requestAnimationFrame(loop)
    }),
)
check('o campinho tem 22 jogadores e se mexe em quase todos os quadros', motion.bodies === 22 && motion.moved >= motion.frames * 0.8, JSON.stringify(motion))
await shoot('treino-onze-contra-onze')

// folga no segundo dia (se houver) e intensidade do primeiro
if (nDays >= 2) {
  await page.getByTestId('training-day').nth(1).click()
  await page.getByTestId('training-rest').click()
  await sleep(1500)
  const s3 = await state()
  check('dar folga entrou na agenda', s3.drills[1] === 'rest', JSON.stringify(s3.drills))
}
await page.getByTestId('training-day').first().click()
await page.getByRole('group', { name: 'Intensidade do dia' }).getByRole('button', { name: 'Intensa' }).click()
await sleep(1500)
const s4 = await state()
check('a intensidade do dia mudou (o servidor aceitou)', s4.agenda[Object.keys(s4.agenda)[0]].intensity === 'intense', JSON.stringify(s4.agenda[Object.keys(s4.agenda)[0]]))
check('os medidores "o que a semana ensaia" aparecem', (await page.getByTestId('training-rehearsal').count()) === 1)

// ------------------------------------------------------------------ o servidor guardou: sair e voltar
await tab('Início')
await page.getByRole('button', { name: 'Mais', exact: true }).click()
await page.getByRole('button', { name: 'Menu · salvar e voltar ao início' }).click()
await page.getByTestId('online-account').waitFor({ timeout: 30000 })
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByText('Abrir a sala').first().click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
const s5 = await state()
check('depois de sair e voltar, a agenda continua (o servidor guardou)', s5.days === nDays && s5.drills[0] === 'full-match', JSON.stringify(s5.drills))
check('depois de sair e voltar, a promessa continua (o servidor guardou)', s5.promise?.kind === 'title', JSON.stringify(s5.promise))
check('depois de sair e voltar, a pré-temporada continua (o servidor guardou)', s5.preseason?.friendlies?.length === 2, JSON.stringify(s5.preseason?.place))

// ------------------------------------------------------------------ olheiro: contratar na tela de Finanças
await page.getByRole('button', { name: 'Finanças' }).first().click()
await page.getByTestId('scouting-card').waitFor({ timeout: 30000 })
check('o cartão do olheiro mostra os 4 níveis com custo mensal', (await page.getByTestId('scout-level').count()) === 4)
check('o efeito de cada nível vem em uma linha', (await page.getByTestId('scouting-card').innerText()).includes('Mostra o craque do adversário'))
await page.locator('[data-testid=scout-level][data-level="2"]').click()
await sleep(1500)
const s6 = await state()
check('escolher o nível 2 vale só no mês seguinte (o de hoje continua 0)', s6.scouting?.level === 0 && s6.scouting?.next === 2, JSON.stringify(s6.scouting))
check('a tela avisa que a troca espera o fechamento do mês', (await page.getByTestId('scout-pending').count()) === 1)
await shoot('olheiro')

// patrocinador e aposta do ano (Finanças, antes do primeiro jogo)
check('o cartão do patrocinador mostra as 3 ofertas', (await page.getByTestId('sponsor-offer').count()) === 3)
await page.locator('[data-testid=sponsor-offer][data-offer="2"]').click()
await sleep(1500)
await page.locator('[data-testid=bet-option][data-kind="points"]').click()
await sleep(1500)
const sb = await state()
check('o patrocinador (oferta 2) valeu no servidor', sb.sponsor === 2, String(sb.sponsor))
check('a aposta do ano (pontos) valeu no servidor', sb.bet?.kind === 'points', JSON.stringify(sb.bet))
await shoot('patrocinador-aposta')

// o servidor guardou o olheiro também
await tab('Início')
await page.getByRole('button', { name: 'Mais', exact: true }).click()
await page.getByRole('button', { name: 'Menu · salvar e voltar ao início' }).click()
await page.getByTestId('online-account').waitFor({ timeout: 30000 })
await page.getByRole('button', { name: 'Ligas online' }).click()
await page.getByText('Abrir a sala').first().click()
await page.getByTestId('open-league-game').click()
await page.getByTestId('league-card').waitFor({ timeout: 90000 })
const s7 = await state()
check('depois de sair e voltar, o olheiro escolhido continua', s7.scouting?.next === 2, JSON.stringify(s7.scouting))
check('depois de sair e voltar, o patrocinador e a aposta continuam', s7.sponsor === 2 && s7.bet?.kind === 'points', `${s7.sponsor} ${JSON.stringify(s7.bet)}`)

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
