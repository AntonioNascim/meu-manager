// Capturas e vídeos curtos: janela de substituição, gol, escanteio, VAR e aviso de posição, em 380 px (jogo solo, servidor de desenvolvimento).
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node e4-animacoes.mjs [http://localhost:4173]
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:4173'
const shots = resolve('../../.shots')
const videos = resolve(shots, 'videos')
mkdirSync(videos, { recursive: true })
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) failed++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const open = async (url, name, video = false) => {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 844 }, deviceScaleFactor: video ? 1 : 2, locale: 'pt-BR', ...(video ? { recordVideo: { dir: videos, size: { width: 380, height: 844 } } } : {}) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [erro]', e.message))
  await page.goto(`${base}/?${url}`)
  return { ctx, page, name }
}
const finish = async ({ ctx, page, name }) => {
  const video = page.video()
  await ctx.close()
  if (video) {
    const file = await video.path()
    const to = resolve(shots, `f1-${name}.webm`)
    renameSync(file, to)
    console.log('  vídeo:', to)
  }
}

// ---------------------------------------------------------------- 3) Escalação: toque num titular abre a janela de substituição
{
  const s = await open('time=imp&semente=7&tela=squad&aba=lineup', 'sub')
  await s.page.waitForSelector('[role=button][aria-label*="toque para escolher"]', { timeout: 90000 })
  await s.page.locator('[role=button][aria-label*="toque para escolher"]').nth(5).click()
  await s.page.getByTestId('substitute-sheet').waitFor({ timeout: 15000 })
  await sleep(500)
  await s.page.screenshot({ path: resolve(shots, 'f1-substituicao.png') })
  const rows = await s.page.locator('[data-testid^=sub-]').count()
  check('a janela de substituição lista jogadores (mesma posição e outras posições)', rows > 3, `${rows} jogadores`)
  const first = s.page.locator('[data-testid^=sub-]:not([disabled])').first()
  await first.click()
  await sleep(600)
  check('tocar num jogador faz a troca e fecha a janela', (await s.page.getByTestId('substitute-sheet').count()) === 0)
  await s.page.screenshot({ path: resolve(shots, 'f1-substituicao-depois.png') })
  await finish(s)
}

// ---------------------------------------------------------------- 2) gol: celebração no meio do campo (vídeo + captura)
{
  const s = await open('time=imp&semente=7&jogo=1&minuto=1&tela=match&iniciar=1&ate=gol', 'gol', true)
  const found = await s.page.getByTestId('goal-celebration').waitFor({ timeout: 180000 }).then(() => true, () => false)
  check('o gol mostra a celebração', found)
  if (found) {
    await sleep(700)
    await s.page.screenshot({ path: resolve(shots, 'f1-gol.png') })
    const text = (await s.page.getByTestId('goal-celebration').innerText()).replace(/\s+/g, ' ')
    check('a celebração tem "GOL!" e o nome de quem fez', /GOL/.test(text) && text.length > 8, text)
    await sleep(3600)
    check('a celebração some depois de alguns segundos', (await s.page.getByTestId('goal-celebration').count()) === 0)
  }
  await finish(s)
}

// ---------------------------------------------------------------- 4) VAR (forçado em desenvolvimento com &var=1) e 2) escanteio, em vídeo
{
  const s = await open('time=imp&semente=7&jogo=1&minuto=1&tela=match&iniciar=1&var=1', 'var-escanteio', true)
  let var1 = false
  let corner = false
  const end = Date.now() + 170000
  while (Date.now() < end && !(var1 && corner)) {
    if (!var1 && (await s.page.getByTestId('var-banner').count()) > 0) {
      var1 = true
      await sleep(300)
      await s.page.screenshot({ path: resolve(shots, 'f1-var.png') })
      console.log('  VAR:', (await s.page.getByTestId('var-banner').innerText()).replace(/\s+/g, ' '))
    }
    if (!corner && (await s.page.locator('[title="Escanteio"]').count()) > 0) {
      corner = true
      // A cena dura alguns segundos (bola ao canto, cobrança em cruzamento): uma rajada de capturas.
      for (let k = 0; k < 10; k++) {
        await s.page.getByTestId('pitch').screenshot({ path: resolve(shots, `f1-escanteio-${k}.png`) })
        await sleep(250)
      }
      console.log('  escanteio:', (await s.page.getByTestId('pitch-line').innerText()).replace(/s+/g, ' '))
    }
    await sleep(250)
  }
  check('o VAR aparece em algum lance (forçado)', var1)
  check('a cobrança de escanteio aparece no campo', corner)
  await finish(s)
}

await browser.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
