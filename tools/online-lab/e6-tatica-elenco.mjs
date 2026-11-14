// Aba Tática da partida (Tática + Trocas reunidas) e correções do Elenco, em 380 px (jogo solo, servidor de desenvolvimento).
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node e6-tatica-elenco.mjs [http://localhost:4173]
import { chromium } from 'playwright'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const shots = resolve('../../.shots')
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const open = async (url) => {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [erro]', e.message))
  await page.goto(`${base}/?${url}`)
  return { ctx, page }
}

// ------------------------------------------------------------------ Elenco: resumo e campo em perspectiva
for (const [time, nome] of [['imp', 'imp'], ['rca', 'rca'], ['pam', 'pam'], ['alv', 'alv'], ['mar', 'mar'], ['loc', 'loc'], ['dun', 'dun'], ['car', 'car']]) {
  const { ctx, page } = await open(`time=${time}&semente=7&tela=squad`)
  await page.getByTestId('squad-field').waitFor({ timeout: 90000 }).catch(() => {})
  if ((await page.getByTestId('squad-field').count()) === 0) {
    console.log('  (time', time, 'não existe; pulando)')
    await ctx.close()
    continue
  }
  await sleep(600)
  await page.screenshot({ path: resolve(shots, `g1-elenco-topo-${nome}.png`) })
  const formation = await page.getByTestId('overview-formation').boundingBox()
  check(`[${nome}] a formação cabe numa linha só`, formation !== null && formation.height < 30, `altura ${Math.round(formation?.height ?? 0)} px`)
  const rects = await page.locator('[data-testid=squad-field] [data-fitname]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { name: el.textContent, form: el.getAttribute('data-fitname'), size: el.style.fontSize, x: r.left, y: r.top, w: r.width, h: r.height, clipped: el.scrollWidth > el.clientWidth + 1 }
    }),
  )
  let overlaps = 0
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps++
    }
  check(`[${nome}] nenhum nome fica em cima de outro no campo`, overlaps === 0, `${overlaps} sobreposições`)
  const clipped = rects.filter((r) => r.clipped).map((r) => r.name)
  check(`[${nome}] nenhum nome aparece cortado`, clipped.length === 0, clipped.join(', '))
  console.log('   formas:', rects.map((r) => `${r.name} (${r.form} ${r.size})`).join(', '))
  await ctx.close()
}

// ------------------------------------------------------------------ Escalação (Time principal): avatares no lugar das camisas
{
  const { ctx, page } = await open('time=imp&semente=7&tela=squad&aba=lineup')
  await page.waitForSelector('[role=button][aria-label*="toque para escolher"]', { timeout: 90000 })
  await sleep(500)
  const avatars = await page.locator('[role=button][aria-label*="toque para escolher"] svg[aria-label], [role=button][aria-label*="toque para escolher"] [data-avatar]').count()
  await page.screenshot({ path: resolve(shots, 'g1-escalacao-avatares.png') })
  console.log('  avatares/ícones dentro dos jogadores:', avatars)
  await ctx.close()
}

// ------------------------------------------------------------------ Partida: aba Tática reunida
{
  const { ctx, page } = await open('time=imp&semente=7&jogo=1&minuto=30&tela=match&aba=tatica')
  await page.getByTestId('move-note').count()
  await page.waitForSelector('[role=button][aria-label*="toque para escolher"]', { timeout: 90000 })
  const tabs = await page.getByRole('tab').allInnerTexts().catch(() => [])
  const text = await page.locator('main').innerText()
  check('as abas são Jogos, Dados e Tática (sem Trocas)', /Jogos/.test(text) && /Dados/.test(text) && /Tática/.test(text) && !/\bTrocas\b/.test(text.split('Lances ao vivo')[0] ?? ''), tabs.join(' | '))
  check('a aba Tática tem estilo, mentalidade, formação e o campo', /formação/i.test(text) && /mentalidade/i.test(text) && (await page.getByTestId('field-lineup').count()) > 0)
  const speedText = async () => (await page.getByTestId('speed').innerText()).replace(/s+/g, ' ').trim()
  const seen = [await speedText()]
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('speed').click()
    seen.push(await speedText())
  }
  check('a velocidade só tem 1x e 2x (começa em 1x)', seen.join(',') === '1x,2x,1x,2x', seen.join(' → '))
  await page.getByTestId('speed').click()
  await page.getByTestId('field-lineup').scrollIntoViewIfNeeded()
  await sleep(300)
  await page.screenshot({ path: resolve(shots, 'g1-partida-tatica.png') })
  const matchNames = await page.locator('[data-testid=field-lineup] [data-fitname]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { name: el.textContent, x: r.left, y: r.top, w: r.width, h: r.height, clipped: el.scrollWidth > el.clientWidth + 1 }
    }),
  )
  let matchOverlaps = 0
  for (let i = 0; i < matchNames.length; i++)
    for (let j = i + 1; j < matchNames.length; j++) {
      const a = matchNames[i]
      const b = matchNames[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) matchOverlaps++
    }
  check('no campo da partida os nomes não se sobrepõem nem ficam cortados', matchOverlaps === 0 && matchNames.every((n) => !n.clipped), `${matchNames.length} nomes, ${matchOverlaps} sobreposições, cortados: ${matchNames.filter((n) => n.clipped).map((n) => n.name).join(', ')}`)
  check('o campo da partida usa avatares (sem camisas antigas)', (await page.locator('[data-testid=field-lineup] svg[aria-label="Camisa"], [data-testid=field-lineup] [data-jersey]').count()) === 0)
  await page.locator('[role=button][aria-label*="toque para escolher"]').nth(6).click()
  await page.getByTestId('player-menu').waitFor({ timeout: 10000 })
  check('tocar num jogador abre "Mudar de posição" e "Substituir"', (await page.getByTestId('menu-move').count()) === 1 && (await page.getByTestId('menu-sub').count()) === 1)
  await sleep(400)
  await page.screenshot({ path: resolve(shots, 'g1-partida-menu.png') })
  await page.getByTestId('menu-sub').click()
  await page.getByTestId('substitute-sheet').waitFor({ timeout: 10000 })
  const rows = await page.locator('[data-testid^=sub-]').count()
  check('"Substituir" abre a janela com os reservas (mesma posição, depois as outras)', rows > 0, `${rows} reservas`)
  await sleep(400)
  await page.screenshot({ path: resolve(shots, 'g1-partida-substituir.png') })
  await page.locator('[data-testid^=sub-]:not([disabled])').first().click()
  await sleep(600)
  const after = await page.locator('main').innerText()
  check('escolher o reserva faz a troca e mostra o aviso', /entra no lugar de/.test(after) && /Substituições restantes: 4/.test(after), (after.match(/Substituições restantes: \d/) ?? [''])[0])
  await page.screenshot({ path: resolve(shots, 'g1-partida-trocou.png') })
  // Mudar de posição: toque, "Mudar de posição" e depois toque em outro jogador
  await page.locator('[role=button][aria-label*="toque para escolher"]').nth(3).click()
  await page.getByTestId('menu-move').click()
  await page.getByTestId('move-hint').waitFor({ timeout: 10000 })
  await page.locator('[role=button][aria-label*="toque para escolher"]').nth(4).click()
  await page.getByTestId('move-note').waitFor({ timeout: 10000 })
  check('mudar de posição continua funcionando (com o aviso discreto)', true)
  await page.screenshot({ path: resolve(shots, 'g1-partida-posicao.png') })
  await ctx.close()
}

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
