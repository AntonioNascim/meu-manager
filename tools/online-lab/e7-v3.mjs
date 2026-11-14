// Redesenho v3: capturas da ficha do jogador e da partida ao vivo em 380 px (em pé) e na horizontal (844 x 390), lado a lado com as referências.
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node e7-v3.mjs [cena ...] [--url=http://localhost:4173]
//   cenas: partida, partida-gol, ficha  (sem argumento, todas)
// Saída em .shots/redesign/v3/: <cena>-em-pe.png, <cena>-horizontal.png e lado-a-lado-<cena>-*.png.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const base = (args.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:4173').slice(6)
const want = args.filter((a) => !a.startsWith('--'))
const out = resolve('../../.shots/redesign/v3')
const refs = resolve('../../docs/redesign/referencias')
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
const shotOf = async (url, name, viewport, prepare, fullPage = true) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  [erro]', e.message))
  await page.goto(`${base}/?${url}`)
  await prepare(page)
  await sleep(900)
  const file = resolve(out, name)
  await page.screenshot({ path: file, fullPage })
  await ctx.close()
  return file
}
const sideBySide = async (refFile, shotFile, name, width) => {
  const ctx = await browser.newContext({ viewport: { width: width * 2 + 48, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const a = readFileSync(refFile).toString('base64')
  const b = readFileSync(shotFile).toString('base64')
  await page.setContent(`<body style="margin:0;background:#222;color:#ddd;font:600 14px sans-serif"><div style="display:flex;gap:16px;padding:12px;align-items:flex-start"><div style="width:${width}px"><div style="padding:4px 0">Referência</div><img style="width:${width}px;display:block" src="data:image/jpeg;base64,${a}"></div><div style="width:${width}px"><div style="padding:4px 0">Meu Manager (novo)</div><img style="width:${width}px;display:block" src="data:image/png;base64,${b}"></div></div></body>`)
  await sleep(500)
  await page.screenshot({ path: resolve(out, name), fullPage: true })
  await ctx.close()
}
const scenes = {
  partida: async () => {
    const ref = resolve(refs, 'partida-ao-vivo.jpeg')
    const prep = async (p) => {
      await p.getByTestId('match-header').waitFor({ timeout: 120000 })
      await sleep(1500)
    }
    const url = 'time=imp&semente=7&jogo=1&minuto=32&tela=match'
    const portrait = await shotOf(url, 'partida-em-pe.png', { width: 380, height: 844 }, prep)
    const land = await shotOf(url, 'partida-horizontal.png', { width: 844, height: 390 }, prep)
    await sideBySide(ref, portrait, 'lado-a-lado-partida-em-pe.png', 380)
    await sideBySide(ref, land, 'lado-a-lado-partida-horizontal.png', 760)
    console.log('partida: ok')
  },
  'partida-gol': async () => {
    const prep = async (p) => {
      await p.getByTestId('goal-celebration').waitFor({ timeout: 240000 })
      await sleep(900)
    }
    await shotOf('time=imp&semente=7&jogo=1&minuto=1&tela=match&iniciar=1&ate=gol', 'partida-gol-em-pe.png', { width: 380, height: 844 }, prep)
    console.log('partida-gol: ok')
  },
  ficha: async () => {
    const ref = resolve(refs, 'ficha-jogador.jpeg')
    const prep = async (p) => {
      await p.waitForSelector('ul li button', { timeout: 120000 })
      await p.locator('ul li button').nth(2).click()
      await p.getByTestId('player-card').waitFor({ timeout: 30000 })
      await sleep(600)
    }
    const url = 'time=imp&semente=7&tela=squad'
    // A ficha é uma janela fixa: a captura usa uma janela alta para mostrar tudo de uma vez.
    const portrait = await shotOf(url, 'ficha-em-pe.png', { width: 380, height: 1180 }, prep, false)
    const land = await shotOf(url, 'ficha-horizontal.png', { width: 844, height: 1000 }, prep, false)
    await sideBySide(ref, portrait, 'lado-a-lado-ficha-em-pe.png', 380)
    await sideBySide(ref, land, 'lado-a-lado-ficha-horizontal.png', 380)
    console.log('ficha: ok')
  },
}
for (const name of want.length > 0 ? want : Object.keys(scenes)) {
  if (!scenes[name]) {
    console.log('cena desconhecida:', name)
    continue
  }
  await scenes[name]()
}
await browser.close()
