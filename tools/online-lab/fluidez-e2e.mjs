// Medição de fluidez do campo 2D da partida (solo), no navegador de verdade, quadro a quadro.
//   VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort
//   cd tools/online-lab && node fluidez-e2e.mjs [http://localhost:5173] [rótulo: antes|depois] [segundos=14] [velocidade=1] [lentidão-da-CPU=1]
// Grava em .shots/fluidez/: <rótulo>-<vel>x[-cpuN].webm (vídeo da tela), <rótulo>-<vel>x-fotos.png (faixa de quadros do campo)
// e <rótulo>-<vel>x[-cpuN].json (métricas: quanto cada jogador andou, saltos da bola por quadro, quadros por segundo).
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5173'
const label = process.argv[3] ?? 'depois'
const seconds = Number(process.argv[4] ?? 14)
const speed = Number(process.argv[5] ?? 1)
const cpu = Number(process.argv[6] ?? 1)
const out = resolve('../../.shots/fluidez')
mkdirSync(out, { recursive: true })
const tag = `${label}-${speed}x${cpu > 1 ? `-cpu${cpu}` : ''}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 1, ...(cpu > 1 ? {} : { recordVideo: { dir: out, size: { width: 420, height: 900 } } }), locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('  [erro na página]', e.message))
if (cpu > 1) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
}
// Partida do time (semente fixa), rodando; os atalhos de desenvolvimento valem só com `vite`.
await page.goto(`${base}/?time=imp&semente=7&jogo=1&tela=match&fps=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.getByTestId('pitch').waitFor({ timeout: 120000 })
for (let i = 0; i < 4; i++) {
  const text = (await page.getByTestId('speed').innerText()).trim()
  if (text.startsWith(`${speed}x`)) break
  await page.getByTestId('speed').click()
}
// Começar a partida.
await page.getByRole('button', { name: /^Começar$/ }).first().click()
await sleep(1500)

// Coletor quadro a quadro: posição normalizada da bola e de cada jogador.
await page.evaluate(() => {
  const field = document.querySelector('[data-testid=pitch] > div')
  window.__frames = []
  const loop = (t) => {
    const r = field.getBoundingClientRect()
    const pos = (el) => {
      const b = el.getBoundingClientRect()
      return [(b.left + b.width / 2 - r.left) / r.width, (b.top + b.height / 2 - r.top) / r.height]
    }
    const ball = document.querySelector('[data-testid=pitch] [aria-label="Bola"]')
    const players = [...document.querySelectorAll('[data-testid=pitch] [data-player]')].map((e) => [e.dataset.player, ...pos(e)])
    window.__frames.push({ t, ball: ball ? pos(ball) : null, players })
    window.__collect = requestAnimationFrame(loop)
  }
  window.__collect = requestAnimationFrame(loop)
})

// Fotos do campo a cada 250 ms durante 3 s (para a faixa de quadros).
const shots = []
const pitch = page.getByTestId('pitch')
for (let i = 0; i < 12; i++) {
  // Com a CPU limitada (medição de desempenho) não há fotos nem vídeo: gravar disputaria a CPU com a página.
  if (cpu === 1) shots.push(await pitch.screenshot({ type: 'png' }))
  await sleep(i < 11 ? 250 : 0)
}
await sleep(Math.max(0, seconds * 1000 - 3000))
const frames = await page.evaluate(() => {
  cancelAnimationFrame(window.__collect)
  return window.__frames
})
const narration = await page.getByTestId('pitch-line').innerText().catch(() => '')
const fpsReport = await page.evaluate(() => window.__pitchFps ?? null)

// Métricas: metros (campo 105 x 68), por jogador e para a bola.
const W = 105
const H = 68
const dist = (a, b) => Math.hypot((a[0] - b[0]) * W, (a[1] - b[1]) * H)
const ids = frames[0]?.players.map((p) => p[0]) ?? []
const travelled = Object.fromEntries(ids.map((id) => [id, 0]))
const movingFrames = Object.fromEntries(ids.map((id) => [id, 0]))
let ballTravelled = 0
let maxBallStep = 0
let bigBallSteps = 0
let ballStill = 0
const dts = []
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1]
  const b = frames[i]
  const dt = b.t - a.t
  dts.push(dt)
  if (a.ball && b.ball) {
    const d = dist(a.ball, b.ball)
    ballTravelled += d
    maxBallStep = Math.max(maxBallStep, d)
    if (d > 8) bigBallSteps++
    if (d < 0.02) ballStill++
  }
  for (const p of b.players) {
    const q = a.players.find((x) => x[0] === p[0])
    if (!q) continue
    const d = dist([q[1], q[2]], [p[1], p[2]])
    travelled[p[0]] += d
    if (d / (dt / 1000) > 0.5) movingFrames[p[0]]++
  }
}
const span = (frames.at(-1)?.t - frames[0]?.t) / 1000
const perPlayer = Object.values(travelled)
const sorted = [...dts].sort((x, y) => x - y)
const report = {
  rotulo: tag,
  segundos: Math.round(span * 10) / 10,
  quadros: frames.length,
  fpsMedio: Math.round(frames.length / span),
  quadroP95Ms: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
  quadroPiorMs: Math.round(sorted.at(-1) ?? 0),
  jogadores: ids.length,
  metrosPorJogadorMedia: Math.round((perPlayer.reduce((a, b) => a + b, 0) / Math.max(1, perPlayer.length)) * 10) / 10,
  metrosPorJogadorMin: Math.round(Math.min(...perPlayer) * 10) / 10,
  bolaMetros: Math.round(ballTravelled),
  bolaMaiorPassoPorQuadroM: Math.round(maxBallStep * 10) / 10,
  bolaSaltosAcimaDe8m: bigBallSteps,
  bolaParadaPct: Math.round((ballStill / Math.max(1, frames.length)) * 100),
  ultimaNarracao: narration,
  medidorDoJogo: fpsReport ? fpsReport.slice(-3) : null,
}
const idle = ids.filter((id) => movingFrames[id] / Math.max(1, frames.length) < 0.25).length
report.jogadoresQueQuaseNaoSeMexem = idle
console.log(JSON.stringify(report, null, 2))
writeFileSync(resolve(out, `${tag}.json`), JSON.stringify(report, null, 2))

// Faixa de quadros: as 12 fotos lado a lado em duas linhas.
if (shots.length > 0) {
const stripCtx = await browser.newContext()
const strip = await stripCtx.newPage()
await strip.setViewportSize({ width: 1500, height: 900 })
await strip.setContent(`<body style="margin:0;background:#06090a;color:#fff;font:14px sans-serif"><h3 style="margin:8px 12px">${tag}: um quadro a cada 250 ms</h3><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 6px">${shots.map((s, i) => `<div><img style="width:100%" src="data:image/png;base64,${s.toString('base64')}"><small>${(i * 0.25).toFixed(2)} s</small></div>`).join('')}</div></body>`)
await strip.waitForTimeout(400)
await strip.screenshot({ path: resolve(out, `${tag}-fotos.png`), fullPage: true })
await stripCtx.close()
}

const video = page.video()
await page.close()
await ctx.close()
await browser.close()
// O Playwright nomeia o vídeo com um código: renomeia o da página da partida.
if (video) renameSync(await video.path(), resolve(out, `${tag}.webm`))
