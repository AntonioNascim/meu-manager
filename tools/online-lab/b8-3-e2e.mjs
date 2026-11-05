// Teste de ponta a ponta da B8.3 (criar e entrar em ligas), no navegador de verdade, contra o servidor LOCAL (wrangler dev --local, sem custo).
// Cada pessoa é um contexto do navegador (banco próprio). Uso (como o b8-e2e.mjs):
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-3-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-3'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Nome único por execução (o servidor local guarda as ligas de execuções anteriores).
const OPEN_NAME = `Liga Aberta ${Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`
const browser = await chromium.launch()

const person = async (nick) => {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [erro na página de ${nick}]`, e.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Criar minha conta online' }).click()
  await page.getByTestId('nickname-input').fill(nick)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByTestId('recovery-words').waitFor()
  const words = (await page.locator('[data-testid=recovery-words] li').allInnerTexts()).map((t) => t.replace(/^\d+\s*/, '').trim())
  await page.getByRole('button', { name: 'Anotei, continuar' }).click()
  const idx = (await page.locator('[data-testid=recovery-setup-confirm] label span.font-semibold').allInnerTexts()).map((t) => Number(t.replace(/\D/g, '')) - 1)
  const inputs = page.locator('[data-testid=recovery-setup-confirm] input')
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill(words[idx[i]])
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.getByTestId('online-account').waitFor()
  return { context, page, nick }
}
const dialogOpen = async (page) => (await page.getByRole('dialog').count()) > 0
const shoot = async (page, name, full = true) => {
  const dialog = await dialogOpen(page)
  if (dialog) await sleep(700)
  await page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`), fullPage: full && !dialog })
}
const openLeagues = async (page) => {
  await page.getByRole('button', { name: 'Ligas online' }).click()
  await page.getByText('Minhas ligas').waitFor()
}

// ------------------------------------------------------------------ Ana cria a liga de amigos
const ana = await person('Ana Treinadora')
const a = ana.page
await shoot(a, '01-menu-com-ligas')
await openLeagues(a)
await a.getByTestId('no-leagues').waitFor()
check('sem ligas: aviso de que ainda não está em nenhuma', await a.getByTestId('no-leagues').isVisible())
await shoot(a, '02-ligas-vazio')
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill('Moderador')
await sleep(200)
check('nome impessoal recusado na hora', (await a.getByText(/parece ser do jogo|não é permitido/).count()) > 0 && (await a.getByRole('button', { name: 'Criar a liga' }).isDisabled()))
await a.getByTestId('league-name').fill('Liga dos Amigos')
await a.getByLabel('Rápido (7 dias por dia)').check()
await a.getByLabel('Só à noite (19h às 22h30)').check()
await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Menos' }).click()
await a.getByRole('button', { name: 'Menos' }).click()
check('máximo de técnicos ajustado para 3', (await a.getByTestId('max-humans').innerText()) === '3')
await shoot(a, '03-criar-liga')
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByTestId('invite-code-shown').waitFor({ timeout: 60000 })
const code = (await a.getByTestId('invite-code-shown').innerText()).replace(/[^A-Z0-9]/g, '')
check('liga criada: código de convite de 8 caracteres e a liga aguarda início', code.length === 8 && (await a.getByText('Aguardando início').count()) > 0, code)
await shoot(a, '04-sala-aguardando')

// ------------------------------------------------------------------ Ana escolhe o clube
await a.getByTestId('pick-club').click()
await a.getByTestId('club-list').waitFor({ timeout: 60000 })
await shoot(a, '05-escolher-clube', false) // só a tela visível: a lista tem 60 clubes
await a.getByTestId('club-search').fill('imperial')
const firstClub = a.locator('[data-testid^=club-team-]').first()
await firstClub.waitFor()
const firstId = await firstClub.getAttribute('data-testid')
await firstClub.click()
await a.getByRole('dialog').waitFor()
await shoot(a, '06-assumir-clube')
await a.getByRole('button', { name: 'Assumir este clube' }).click()
await a.getByTestId('members').getByText('Ana Treinadora').waitFor()
check('o ADM assumiu o clube e aparece na lista de técnicos', (await a.getByTestId('members').innerText()).includes('Ana Treinadora'))

// ------------------------------------------------------------------ Bia entra pelo código
const bia = await person('Bia Craque')
const b = bia.page
await openLeagues(b)
await b.getByRole('button', { name: 'Entrar com um código de convite' }).click()
await b.getByTestId('invite-code').fill('ZZZZ2222')
await b.getByRole('button', { name: 'Procurar a liga' }).click()
await b.getByTestId('code-error').waitFor()
check('código errado: mensagem clara', (await b.getByTestId('code-error').innerText()).includes('Código não encontrado'))
await shoot(b, '07-codigo-errado')
await b.getByTestId('invite-code').fill(code.slice(0, 4).toLowerCase() + '-' + code.slice(4))
await b.getByRole('button', { name: 'Procurar a liga' }).click()
await b.getByTestId('pick-club').waitFor({ timeout: 30000 })
check('código certo (minúsculas e hífen) abre a sala da liga', (await b.getByText('Liga dos Amigos').count()) > 0)
await b.getByTestId('pick-club').click()
await b.getByTestId('club-list').waitFor({ timeout: 60000 })
await b.getByTestId('club-search').fill('imperial')
await sleep(300)
check('o clube que o ADM já tem aparece bloqueado, com o nome do técnico', (await b.locator(`[data-testid="${firstId}"]`).isDisabled()) && (await b.locator(`[data-testid="${firstId}"]`).innerText()).includes('Ana Treinadora'))
await shoot(b, '08-clube-ocupado', false)
await b.getByTestId('club-search').fill('')
const second = b.locator('[data-testid^=club-team-]:not([disabled])').nth(5)
await second.click()
await b.getByRole('button', { name: 'Assumir este clube' }).click()
await b.getByTestId('members').getByText('Bia Craque').waitFor()
check('Bia entrou: dois técnicos na lista', (await b.getByTestId('members').locator('li').count()) === 2)

// ------------------------------------------------------------------ Cai entra pelo link de convite; Dan encontra a liga cheia
const cai = await person('Cai Zagueiro')
const c = cai.page
await c.goto(`${base}/?convite=${code}`)
await c.getByTestId('invite-code').waitFor({ timeout: 30000 })
check('o link de convite abre a tela de código já preenchida', (await c.getByTestId('invite-code').inputValue()) === code)
await c.getByRole('button', { name: 'Procurar a liga' }).click()
await c.getByTestId('pick-club').click()
await c.getByTestId('club-list').waitFor({ timeout: 60000 })
await c.locator('[data-testid^=club-team-]:not([disabled])').nth(9).click()
await c.getByRole('button', { name: 'Assumir este clube' }).click()
await c.getByTestId('members').getByText('Cai Zagueiro').waitFor()
check('Cai entrou: três técnicos (liga cheia)', (await c.getByTestId('members').locator('li').count()) === 3)
const dan = await person('Dan Goleiro')
const d = dan.page
await openLeagues(d)
await d.getByRole('button', { name: 'Entrar com um código de convite' }).click()
await d.getByTestId('invite-code').fill(code)
await d.getByRole('button', { name: 'Procurar a liga' }).click()
await d.getByText('A liga está cheia.').waitFor({ timeout: 30000 })
check('com a liga cheia, o quarto técnico não consegue entrar', true)

// ------------------------------------------------------------------ ADM: remover, fechar entrada, iniciar
await a.reload()
await a.getByTestId('online-account').waitFor()
await openLeagues(a)
await a.getByText('Abrir a sala').first().click()
await a.getByTestId('members').waitFor()
await a.getByTestId('kick-Cai Zagueiro').click()
await a.waitForFunction(() => !document.querySelector('[data-testid=members]')?.textContent?.includes('Cai Zagueiro'))
check('o ADM removeu o Cai e a vaga reabriu', (await a.getByTestId('members').locator('li').count()) === 2)
await a.getByRole('button', { name: 'Fechar a entrada' }).click()
await a.getByText('Entrada fechada').first().waitFor()
await a.getByRole('button', { name: 'Reabrir a entrada' }).click()
await a.getByRole('button', { name: 'Fechar a entrada' }).waitFor()
await a.getByTestId('start-league').click()
await a.getByText('Em andamento').first().waitFor({ timeout: 60000 })
check('o ADM iniciou a liga: "Em andamento"', true)
await shoot(a, '09-sala-em-andamento')
await b.getByText('Em andamento').first().waitFor({ timeout: 25000 }) // a sala se atualiza a cada 6 s
check('Bia (outra pessoa) vê a liga em andamento sozinha, sem recarregar', true)

// Cai (removido) tenta voltar: liga em andamento aceita um clube livre.
await c.goto(base)
await c.getByTestId('online-account').waitFor()
await openLeagues(c)
await c.getByTestId('no-leagues').waitFor()
check('quem foi removido não vê mais a liga em "Minhas ligas"', (await c.getByTestId('no-leagues').count()) === 1)

// ------------------------------------------------------------------ liga aberta no diretório
await a.getByRole('button', { name: 'Voltar' }).click()
await a.getByRole('button', { name: 'Criar uma liga' }).click()
await a.getByTestId('league-name').fill(OPEN_NAME)
await a.getByRole('button', { name: 'Aberta', exact: true }).click()
await a.getByRole('button', { name: 'Criar a liga' }).click()
await a.getByText('Aguardando início').first().waitFor({ timeout: 60000 })
check('liga aberta não tem código de convite', (await a.getByTestId('invite-code-shown').count()) === 0)
await d.getByRole('button', { name: 'Voltar' }).click()
await d.getByRole('button', { name: 'Procurar ligas abertas' }).click()
await d.getByText(OPEN_NAME).waitFor({ timeout: 30000 })
check('a liga aberta aparece no diretório e a de amigos não', (await d.getByText('Liga dos Amigos').count()) === 0)
await shoot(d, '10-ligas-abertas')
await d.getByText(OPEN_NAME).click()
await d.getByTestId('pick-club').click()
await d.getByTestId('club-list').waitFor({ timeout: 60000 })
await d.locator('[data-testid^=club-team-]:not([disabled])').nth(3).click()
await d.getByRole('button', { name: 'Assumir este clube' }).click()
await d.getByTestId('members').getByText('Dan Goleiro').waitFor()
check('Dan entrou na liga aberta pelo diretório', true)

// ------------------------------------------------------------------ Bia sai; o ADM sai e o cargo passa
await b.getByRole('button', { name: 'Sair da liga' }).click()
await b.getByRole('dialog').waitFor()
await shoot(b, '11-sair-da-liga')
await b.getByTestId('confirm-leave').click()
await b.getByTestId('no-leagues').waitFor()
check('Bia saiu da liga', true)

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
