// Captura os mockups em 380 px (2x) com o Edge via protocolo de depuração. Uso: node docs/redesign/mockups/shoot.cjs
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ROOT = path.resolve(__dirname)
const OUT = path.resolve(__dirname, '../../../.shots/redesign')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${process.env.TEMP}/edge-shoot`, 'about:blank'], { stdio: 'ignore' })
  let list
  for (let i = 0; i < 40; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break } catch {}
    await sleep(250)
  }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const only = process.argv[2]
  for (const d of ['figurinha', 'prancheta', 'tabloide']) {
    for (const s of ['menu', 'painel', 'partida']) {
      if (only && !`${d}-${s}`.includes(only)) continue
      await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 2, mobile: true })
      await send('Page.navigate', { url: `file:///${ROOT.replace(/\\/g, '/')}/${d}/${s}.html?static` })
      await sleep(2500)
      const r = await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>Math.ceil(document.documentElement.scrollHeight))', awaitPromise: true, returnByValue: true })
      const h = r.result.result.value
      await send('Emulation.setDeviceMetricsOverride', { width: 380, height: h, deviceScaleFactor: 2, mobile: true })
      await sleep(600)
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const file = path.join(OUT, `380-${d}-${s}.png`)
      fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
      console.log(file, `${h}px`)
    }
  }
  ws.close(); edge.kill()
})()
