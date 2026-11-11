// Captura em 380 px (2x) com o Edge. Uso: node docs/redesign/final/shoot.cjs [filtro]
const { pathToFileURL } = require('url')
const { spawn } = require('child_process'), fs = require('fs'), path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SRC = path.join(__dirname, 'html'), OUT = path.resolve(__dirname, '../../../.shots/redesign/final')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 9335, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${process.env.TEMP}/edge-shoot2`, 'about:blank'], { stdio: 'ignore' })
  let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break } catch {} await sleep(250) }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
  let id = 0; const pend = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const only = process.argv[2]
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.html')).sort()) {
    if (only && !f.includes(only)) continue
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url: 'file:///' + pathToFileURL(path.join(SRC, f)).href.replace('file:///', '') })
    await sleep(700)
    const r = await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>Math.max(800,Math.ceil(document.documentElement.scrollHeight)))', awaitPromise: true, returnByValue: true })
    const h = r.result.result.value
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: h, deviceScaleFactor: 2, mobile: true })
    await sleep(250)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(OUT, f.replace('.html', '.png')), Buffer.from(shot.result.data, 'base64'))
    console.log(f, h + 'px')
  }
  ws.close(); edge.kill()
})()
