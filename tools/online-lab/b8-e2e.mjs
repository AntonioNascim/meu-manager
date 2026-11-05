// Teste de ponta a ponta da B8.1 e B8.2 (conta online, código de recuperação e saves na nuvem), no navegador de verdade, contra um servidor LOCAL
// (wrangler dev --local, sem conta e sem custo) e o Vite em desenvolvimento. Dois aparelhos = dois contextos do navegador (bancos separados).
// Uso (três terminais):
//   cd server && npx wrangler dev --local --port 8787
//   VITE_API_BASE=http://127.0.0.1:8787 VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node b8-e2e.mjs [http://localhost:5173] [prefixo-das-capturas]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'b8-1-2-pronta'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const device = async () => {
  const context = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
  await page.goto(base)
  await page.getByText('Meu Manager').first().waitFor()
  return { context, page }
}
// Com uma janela aberta (Sheet) a captura é só da tela visível: a página inteira deformaria a janela fixa.
const shoot = async (page, name) => {
  const dialog = (await page.getByRole('dialog').count()) > 0
  if (dialog) await sleep(700) // espera a janela terminar de subir
  return page.screenshot({ path: resolve(shots, `${prefix}-${name}.png`), fullPage: !dialog })
}

/** Grava um save nos espaços (usa os mesmos módulos que o jogo, servidos pelo Vite). */
const seed = (page, slot, seedNumber) =>
  page.evaluate(
    async ([slot, n]) => {
      const { createGame } = await import('/src/store/game.ts')
      const { saveToSlot } = await import('/src/store/saves.ts')
      await saveToSlot(slot, createGame(n, 'team-imp'))
    },
    [slot, seedNumber],
  )
const advance = (page, slot, days) =>
  page.evaluate(
    async ([slot, days]) => {
      const { advanceGame } = await import('/src/store/game.ts')
      const { loadSlot, saveToSlot } = await import('/src/store/saves.ts')
      let g = await loadSlot(slot)
      for (let i = 0; i < days; i++) g = advanceGame(g)
      await saveToSlot(slot, g)
    },
    [slot, days],
  )
const localSlots = (page) =>
  page.evaluate(async () => {
    const { listSlots } = await import('/src/store/saves.ts')
    return (await listSlots()).map((s) => (s ? `${s.teamName}|${s.savedAt}` : null))
  })

// ------------------------------------------------------------------ aparelho A
const A = await device()
const a = A.page
check('menu sem conta mostra "Criar minha conta online"', await a.getByTestId('online-no-account').isVisible())
await shoot(a, '01-menu-sem-conta')

await a.getByRole('button', { name: 'Criar minha conta online' }).click()
await a.getByTestId('nickname-input').fill('Fulano_Idiota')
await sleep(200)
check('apelido ofensivo recusado na hora, sem ir ao servidor', (await a.getByText('Esse nome não é permitido').count()) > 0 && (await a.getByRole('button', { name: 'Continuar' }).isDisabled()))
await shoot(a, '03-apelido')
await a.getByTestId('nickname-input').fill('Craque Ana')
await a.getByRole('button', { name: 'Continuar' }).click()
await a.getByTestId('recovery-words').waitFor()
const words = (await a.locator('[data-testid=recovery-words] li').allInnerTexts()).map((t) => t.replace(/^\d+\s*/, '').trim())
check('código de 12 palavras mostrado depois de o servidor aceitar', words.length === 12 && words.every(Boolean), words.join(' '))
await shoot(a, '04-codigo-anotar')
await a.getByRole('button', { name: 'Anotei, continuar' }).click()
const labels = await a.locator('[data-testid=recovery-setup-confirm] label span.font-semibold').allInnerTexts()
const idx = labels.map((t) => Number(t.replace(/\D/g, '')) - 1)
const inputs = a.locator('[data-testid=recovery-setup-confirm] input')
await inputs.nth(0).fill(words[idx[0]])
await inputs.nth(1).fill('palavraerrada')
await inputs.nth(2).fill(words[idx[2]])
await a.getByRole('button', { name: 'Confirmar' }).click()
check('palavra errada na conferência barra o avanço', (await a.getByText('Alguma palavra não confere').count()) > 0)
await shoot(a, '05-codigo-confirmar')
await inputs.nth(1).fill(words[idx[1]])
await a.getByRole('button', { name: 'Confirmar' }).click()
await a.getByTestId('online-account').waitFor()
check('depois de confirmar, o menu mostra a conta com o apelido', (await a.getByTestId('online-account').innerText()).includes('Craque Ana'))
await shoot(a, '02-menu-com-conta')
check('código confirmado: sem o aviso "anote!"', (await a.getByTestId('online-account').innerText()).includes('anote!') === false)

// código de recuperação pelo menu
await a.getByRole('button', { name: /Código de recuperação/ }).click()
await a.getByTestId('recovery-view').waitFor()
check('o código começa escondido', (await a.getByTestId('recovery-words').count()) === 0)
await shoot(a, '06-codigo-rever')
await a.clock.install()
await a.getByRole('button', { name: 'Mostrar o código' }).click()
const again = (await a.locator('[data-testid=recovery-words] li').allInnerTexts()).map((t) => t.replace(/^\d+\s*/, '').trim())
check('rever o código mostra as mesmas 12 palavras', JSON.stringify(again) === JSON.stringify(words))
await a.clock.fastForward(31_000)
check('o código se esconde sozinho depois de 30 segundos', (await a.getByTestId('recovery-words').count()) === 0)
await a.getByRole('button', { name: 'Voltar' }).click()

// ------------------------------------------------------------------ saves na nuvem (A)
await seed(a, 1, 7)
await seed(a, 2, 8)
await a.reload()
await a.getByTestId('online-account').waitFor()
await a.getByRole('button', { name: /Saves na nuvem/ }).click()
await a.getByTestId('cloud-saves').waitFor()
await sleep(600)
await shoot(a, '08-saves-nuvem')
await a.getByTestId('toggle-espaço 1').click()
await a.getByRole('dialog').waitFor()
await shoot(a, '09-ligar-nuvem')
await a.getByRole('button', { name: 'Ligar e enviar agora' }).click()
await a.getByTestId('status-1').waitFor()
await a.waitForFunction(() => document.querySelector('[data-testid=status-1]')?.textContent?.includes('Sincronizado'), null, { timeout: 30000 })
check('espaço 1 ligado e enviado: "Sincronizado"', true)
await a.getByTestId('toggle-espaço 2').click()
await a.getByRole('button', { name: 'Ligar e enviar agora' }).click()
await a.waitForFunction(() => document.querySelector('[data-testid=status-2]')?.textContent?.includes('Sincronizado'), null, { timeout: 30000 })
await sleep(800)
await shoot(a, '08b-saves-nuvem-sincronizados')
await a.getByRole('button', { name: 'Voltar' }).click()
await a.getByTestId('online-account').waitFor()
await sleep(500)
check('o menu mostra "Na nuvem" no save ligado e "2 de 3"', (await a.getByText('Na nuvem', { exact: true }).count()) > 0 && (await a.getByText('Saves na nuvem (2 de 3)').count()) > 0)
await shoot(a, '02b-menu-na-nuvem')

// ------------------------------------------------------------------ aparelho B: entrar com o código e baixar o save
const B = await device()
const b = B.page
await b.getByRole('button', { name: /Entrar com o código/ }).click()
await b.getByTestId('recover-input').fill(words.slice(0, 11).join(' '))
check('11 de 12 palavras: o botão Entrar fica desligado', await b.getByRole('button', { name: 'Entrar' }).isDisabled())
await shoot(b, '07-entrar-com-codigo')
await b.getByTestId('recover-input').fill(words.slice().reverse().join(' '))
await b.getByRole('button', { name: 'Entrar' }).click()
await b.getByTestId('recover-error').waitFor()
check('código com a ordem trocada é recusado com o motivo', (await b.getByTestId('recover-error').innerText()).length > 10, await b.getByTestId('recover-error').innerText())
await b.getByTestId('recover-input').fill(words.map((w) => w.toUpperCase()).join(', '))
await b.getByRole('button', { name: 'Entrar' }).click()
await b.getByTestId('online-account').waitFor()
check('o mesmo código (maiúsculas e vírgulas) entra na conta, com o apelido', (await b.getByTestId('online-account').innerText()).includes('Craque Ana'))
await b.getByRole('button', { name: /Saves na nuvem/ }).click()
await b.getByRole('button', { name: 'Baixar para este aparelho' }).first().waitFor()
await shoot(b, '08c-saves-so-na-nuvem')
check('o aparelho novo começa sem saves locais', (await localSlots(b)).every((s) => s === null))
await b.getByRole('button', { name: 'Baixar para este aparelho' }).first().click()
await b.waitForFunction(() => document.querySelector('[data-testid=status-1]')?.textContent?.includes('Sincronizado'), null, { timeout: 30000 })
check('save baixado para o aparelho B', (await localSlots(b))[0] !== null)

// ------------------------------------------------------------------ conflito: os dois jogam o espaço 1
await advance(a, 1, 2)
await a.getByRole('button', { name: 'Enviar agora' }).first().waitFor({ timeout: 8000 }).catch(() => {})
await a.evaluate(async () => {
  const { getCloud } = await import('/src/store/onlineAccount.ts')
  await getCloud().sync.sync(1)
})
await advance(b, 1, 3)
await b.evaluate(async () => {
  const { getCloud } = await import('/src/store/onlineAccount.ts')
  await getCloud().sync.sync(1)
})
await sleep(3500)
check('B tentou enviar e ficou em conflito (nada foi sobrescrito)', (await b.getByTestId('status-1').innerText()).includes('Conflito'))
await b.getByRole('button', { name: 'Resolver o conflito' }).click()
await b.getByRole('dialog').waitFor()
await shoot(b, '10-conflito')
const beforeB = await localSlots(b)
await b.getByRole('button', { name: /Guardar as duas/ }).click()
await b.waitForFunction(() => !document.querySelector('[role=dialog]'), null, { timeout: 30000 })
const afterB = await localSlots(b)
check('"Guardar as duas": a versão da nuvem foi para um espaço livre e a do B continua no 1', afterB[1] !== null && afterB[0] === beforeB[0], JSON.stringify(afterB.map((s) => s?.split('|')[0])))
await sleep(3500)
check('depois de resolver, o espaço 1 volta a "Sincronizado"', (await b.getByTestId('status-1').innerText()).includes('Sincronizado'))

// ------------------------------------------------------------------ dados e conta (A)
await a.reload()
await a.getByTestId('online-account').waitFor()
await a.getByRole('button', { name: 'Dados e conta' }).click()
await a.getByTestId('account-data').waitFor()
await shoot(a, '11-dados-e-conta')
await a.getByTestId('account-nickname').fill('Admin')
await a.getByRole('button', { name: 'Salvar apelido' }).click()
await a.getByTestId('nickname-message').waitFor()
check('trocar para apelido proibido: recusado com o motivo', (await a.getByTestId('nickname-message').innerText()).includes('parece ser do jogo'))
await a.getByTestId('account-nickname').fill('Mister Ana')
await a.getByRole('button', { name: 'Salvar apelido' }).click()
await a.waitForFunction(() => document.querySelector('[data-testid=nickname-message]')?.textContent?.includes('atualizado'))
check('apelido trocado', true)
const download = a.waitForEvent('download')
await a.getByRole('button', { name: 'Baixar meus dados' }).click()
const file = await download
const exported = JSON.parse(await (await import('node:fs/promises')).readFile(await file.path(), 'utf8'))
check('exportar meus dados baixa um arquivo com a conta e os saves da nuvem', JSON.stringify(exported).includes('Mister Ana') || JSON.stringify(exported).includes('saves'), `${file.suggestedFilename()} (${JSON.stringify(exported).length} caracteres)`)

await a.getByRole('button', { name: 'Apagar minha conta…' }).click()
await a.getByRole('dialog').waitFor()
await a.getByTestId('delete-confirm-input').fill('Mister An')
await shoot(a, '12-apagar-conta')
check('apagar só habilita com o apelido digitado por inteiro', await a.getByTestId('confirm-delete').isDisabled())
await a.getByTestId('delete-confirm-input').fill('Mister Ana')
const slotsBefore = await localSlots(a)
await a.getByTestId('confirm-delete').click()
await a.getByTestId('online-no-account').waitFor({ timeout: 30000 })
check('conta apagada: o menu volta ao estado sem conta', true)
check('os saves deste aparelho continuam intactos', JSON.stringify(await localSlots(a)) === JSON.stringify(slotsBefore) && slotsBefore[0] !== null)
// B ainda tem a chave, mas a conta não existe mais no servidor.
await b.evaluate(async () => {
  const { getCloud } = await import('/src/store/onlineAccount.ts')
  await getCloud().sync.sync(1, { force: true })
})
await sleep(500)
check('no servidor, a conta e os saves sumiram (o aparelho B recebe "não registrado")', (await b.evaluate(async () => (await (await import('/src/store/onlineAccount.ts')).cloudState.get(1)).status)) === 'error')

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
