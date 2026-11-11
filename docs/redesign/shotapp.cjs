// Captura o jogo de verdade em 380 px (2x) com o Edge. Uso: node docs/redesign/shotapp.cjs "<url>" nome [esperaMs]
// Várias: node docs/redesign/shotapp.cjs "url1=nome1" "url2=nome2" ...
const { spawn } = require('child_process'), fs = require('fs'), path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const OUT = path.resolve(__dirname, '../../.shots/redesign/app')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 9336, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${process.env.TEMP}/edge-shoot3`, 'about:blank'], { stdio: 'ignore' })
  let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break } catch {} await sleep(250) }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
  let id = 0; const pend = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  for (const arg of process.argv.slice(2)) {
    const k = arg.lastIndexOf('='); const url = arg.slice(0, k), name = arg.slice(k + 1)
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url })
    await sleep(3500)
    const r = await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>Math.max(800,Math.ceil(document.documentElement.scrollHeight)))', awaitPromise: true, returnByValue: true })
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: Math.min(r.result.result.value, 3000), deviceScaleFactor: 2, mobile: true })
    await sleep(300)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.result.data, 'base64'))
    console.log(name)
  }
  ws.close(); edge.kill()
})()
