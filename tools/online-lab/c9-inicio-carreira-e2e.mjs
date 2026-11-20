// Teste de ponta a ponta (estudo do concorrente, Parte 5): o início de carreira no jogo solo, no navegador de verdade (sem servidor).
//   VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node c9-inicio-carreira-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
// Confere: as quatro propostas com contagem regressiva, "Que outros liguem", os desafios, a ficha do clube, o contrato com assinatura, o espaço de
// salvamento, a coletiva de apresentação que abre sozinha, a promessa na diretoria e a aba Conquistas. Capturas de 380 px em .shots/.
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'c9'
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
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
const shoot = async (name) => {
  await sleep(500)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`) })
}
const state = () =>
  page.evaluate(() => {
    const g = window.__mm.getGame()
    if (!g) return null
    const t = g.season.teams.find((x) => x.id === g.userTeamId)
    return { team: t.name, promise: t.promise ?? null, challenge: g.challenge ?? null, conquests: g.conquests ?? [], year: g.season.season.year }
  })

await page.goto(`${base}/?menu=novo`)
await page.getByTestId('offers').waitFor({ timeout: 90000 })
check('aparecem quatro propostas de clubes', (await page.getByTestId('offer').count()) === 4)
const first = await page.getByTestId('offer').first().getAttribute('data-team')
check('cada proposta tem contagem regressiva', /\d:\d\d/.test(await page.getByTestId('offer').first().innerText()))
await page.getByTestId('more-offers').click()
await sleep(400)
const again = await page.getByTestId('offer').first().getAttribute('data-team')
check('"Que outros liguem" traz outras propostas', again !== first, `${first} -> ${again}`)
check('a escolha livre por país e liga continua', (await page.getByTestId('country-picker').count()) === 1)
check('aparecem os desafios com estrelas', (await page.getByTestId('challenge').count()) >= 3 && (await page.getByTestId('challenges').innerText()).includes('★'))
await shoot('inicio-propostas')

// aceita um desafio: o clube dele fica escolhido
await page.getByTestId('challenge-accept').first().click()
await sleep(400)
check('aceitar o desafio escolhe o clube e marca "Desafio aceito"', (await page.getByTestId('challenges').innerText()).includes('Desafio aceito'))
await page.getByTestId('know-club').click()
await page.getByTestId('club-sheet').waitFor()
check('a ficha do clube mostra diretoria, estádio, orçamento e elenco', /A diretoria/.test(await page.getByTestId('club-sheet').innerText()) && /O elenco que você herda/.test(await page.getByTestId('club-sheet').innerText()))
await shoot('inicio-ficha')
await page.getByTestId('club-sheet-sign').click()
await page.getByTestId('contract').waitFor()
check('o contrato abre com a caixa de assinatura', (await page.getByTestId('signature-pad').count()) === 1)
check('não dá para assinar o contrato antes da assinatura', await page.getByTestId('sign-contract').isDisabled())
await page.getByTestId('sign-for-me').click()
await shoot('inicio-contrato')
await page.getByTestId('sign-contract').click()
await page.getByRole('button', { name: 'Salvar aqui' }).first().click()

// coletiva de apresentação: abre sozinha depois de começar o jogo
await page.getByTestId('press-conference').waitFor({ timeout: 60000 })
check('a coletiva de apresentação abre sozinha com as três respostas', (await page.getByTestId('promise').count()) === 3)
await shoot('inicio-coletiva')
await page.locator('[data-kind="continental"]').click()
await sleep(1000)
const s = await state()
check('a promessa valeu (vaga continental)', s?.promise?.kind === 'continental' && s.promise.year === s.year, JSON.stringify(s?.promise))
check('o desafio aceito está no jogo', !!s?.challenge && s.challenge.seasonsPlayed === 0, JSON.stringify(s?.challenge?.id))
check('depois de responder o cartão da coletiva some', (await page.getByTestId('press-card').count()) === 0)

// aba Conquistas
await page.getByRole('button', { name: 'Mais', exact: true }).click()
await page.getByText('Carreira', { exact: true }).first().click()
await page.getByRole('tab', { name: 'Conquistas' }).click()
await page.getByTestId('conquests').waitFor()
check('a aba Conquistas mostra o desafio em andamento', (await page.getByTestId('active-challenge').count()) === 1)
await shoot('inicio-conquistas')

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
