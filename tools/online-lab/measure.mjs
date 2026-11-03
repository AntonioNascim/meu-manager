// Joga uma temporada no workerd local e mede tempo por avanço (visto de fora) e memória do processo workerd.
import { execSync } from 'node:child_process'
const base = 'http://127.0.0.1:8799'
const rss = () => {
  try { return Math.round(Number(execSync('powershell -NoProfile -Command "(Get-Process workerd | Measure-Object WorkingSet64 -Sum).Sum/1MB"').toString().replace(',', '.'))) } catch { return NaN }
}
const get = async (p) => { const t = performance.now(); const r = await fetch(base + p); const j = r.ok ? await r.json() : await r.text(); return { ms: performance.now() - t, j, ok: r.ok } }
await new Promise((r) => setTimeout(r, 2000))
console.log('RSS workerd antes:', rss(), 'MB')
const l = await get('/load'); console.log('load', Math.round(l.ms), 'ms', JSON.stringify(l.j), 'RSS', rss())
const times = []; let peak = 0, last
for (let i = 1; i <= 400; i++) {
  const a = await get('/advance?n=1')
  if (!a.ok) { console.log('ERRO no avanço', i, String(a.j).slice(0, 400)); break }
  times.push(a.ms); last = a.j
  if (i % 15 === 0) { const r = rss(); peak = Math.max(peak, r); console.log(`avanço ${i}: ${last.date} jogos ${last.finished}/${last.matches} RSS ${r} MB`) }
  if (last.finished >= last.matches || last.dismissed) { console.log("fim:", JSON.stringify(last)); break }
}
times.sort((a, b) => a - b)
const q = (p) => Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))])
console.log(`avanços ${times.length} · soma ${(times.reduce((s, x) => s + x, 0) / 1000).toFixed(1)} s · mediana ${q(0.5)} ms · p95 ${q(0.95)} ms · máx ${Math.round(times[times.length - 1])} ms · RSS pico ${peak} MB · fim ${rss()} MB`)
