// Confere que o resultado de um lance só aparece quando a bola chega ao destino: registra, quadro a quadro, o placar, a celebração, a linha do tempo e a posição da bola.
//   npx vite --port 4173 --strictPort ; cd tools/online-lab && node revela-resultado.mjs [http://localhost:4173]
import { chromium } from 'playwright'
const base = process.argv[2] ?? 'http://localhost:4173'
const CASES = [{ nome: 'gol', seed: 7, minute: 8 }, { nome: 'penalti', seed: 5, minute: 14 }]
const browser = await chromium.launch()
let bad = 0
for (const c of CASES) {
  for (const speed of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 380, height: 900 }, locale: 'pt-BR' })
    const page = await ctx.newPage()
    await page.addInitScript(() => {
      window.__rec = []
      const t0 = performance.now()
      let prev = ''
      const tick = () => {
        const q = (s) => document.querySelector(s)
        const ball = q('[aria-label="Bola"]'), field = q('[data-testid="pitch"] > div')
        let bx = null
        if (ball && field) { const b = ball.getBoundingClientRect(), f = field.getBoundingClientRect(); bx = +(((b.left + b.width / 2 - f.left) / f.width)).toFixed(3) }
        const row = {
          t: Math.round(performance.now() - t0),
          score: q('[data-testid="score"]')?.textContent?.replace(/\s+/g, '') ?? '',
          goal: !!q('[data-testid="goal-celebration"]'),
          call: q('[data-testid="penalty-call"]')?.textContent ?? '',
          goals: q('[data-testid="goal-line"]')?.textContent ?? '',
          line: q('[data-testid="pitch-line"]')?.textContent ?? '',
          tl: (q('[data-testid="timeline-card"]') ?? document.body).textContent?.includes('Gol') ?? false,
          bx,
        }
        const key = JSON.stringify({ ...row, t: 0, bx: 0 })
        if (key !== prev) { prev = key; window.__rec.push(row) }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto(`${base}/?time=imp&semente=${c.seed}&jogo=1&minuto=${c.minute - 3}&tela=match&iniciar=1`, { timeout: 120000, waitUntil: "domcontentloaded" })
    await page.getByTestId('pitch').waitFor({ timeout: 90000 })
    if (speed === 2) await page.getByTestId('speed').click()
    await page.waitForTimeout(speed === 1 ? 40000 : 26000)
    const rec = await page.evaluate(() => window.__rec)
    console.log(`\n== ${c.nome} ${speed}x`)
    let first = null
    for (const r of rec) {
      const interesting = r.goal || r.call || /GOL|Defend|fora|finaliza|cobran|bala|rede/i.test(r.line) || r.goals
      if (interesting) console.log(`  t=${r.t}ms placar=${r.score} bola.x=${r.bx} gol=${r.goal} chamada="${r.call}" linha="${r.line}"${r.goals ? ` gols="${r.goals.slice(0, 40)}"` : ''}`)
      if (!first && (r.goal || r.call)) first = r
    }
    // cada celebração tem de nascer junto da mudança do placar (até 150 ms) e com a bola na linha do gol
    rec.forEach((r, i) => {
      if (!r.goal || (rec[i - 1] && rec[i - 1].goal)) return
      let k = i
      while (k > 0 && rec[k].score === r.score) k--
      const dt = r.t - rec[Math.min(k + 1, i)].t
      const line = r.bx !== null && (r.bx < 0.03 || r.bx > 0.97)
      console.log('  celebração: placar mudou há ' + dt + ' ms, bola.x=' + r.bx + (dt <= 150 && line ? ' ✔' : ' ✘'))
      if (!(dt <= 150 && line)) bad++
    })
    await ctx.close()
  }
}
await browser.close()
console.log(bad ? `\nPROBLEMAS: ${bad}` : '\nok: resultado só aparece com a bola no destino')
process.exit(bad ? 1 : 0)
