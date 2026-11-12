// Monta "referência | jogo" lado a lado (cada lado com 380 px) e salva em .shots/redesign/v2/lado-a-lado-<nome>.png.
// Uso: node docs/redesign/shotcompare.cjs nome "caminho/da/referencia.jpeg" "caminho/da/captura.png" ...
const { spawn } = require('child_process'), fs = require('fs'), path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, '.shots/redesign/v2')
fs.mkdirSync(OUT, { recursive: true })
const PORT = 9337, sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const url = (f) => 'file:///' + path.resolve(ROOT, f).replace(/\\/g, '/')
;(async () => {
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${process.env.TEMP}/edge-shoot4`, 'about:blank'], { stdio: 'ignore' })
  let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break } catch {} await sleep(250) }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
  let id = 0; const pend = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 3) {
    const [name, ref, shot] = args.slice(i, i + 3)
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222;color:#ddd;font:600 14px sans-serif">
<div style="display:flex;gap:12px;padding:12px;align-items:flex-start">
<div style="width:380px"><div style="padding:4px 0">Referência</div><img style="width:380px;display:block" src="${url(ref)}"></div>
<div style="width:380px"><div style="padding:4px 0">Meu Manager (novo)</div><img style="width:380px;display:block" src="${url(shot)}"></div>
</div></body>`
    const tmp = path.join(OUT, `_${name}.html`)
    fs.writeFileSync(tmp, html)
    await send('Emulation.setDeviceMetricsOverride', { width: 804, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: url(path.relative(ROOT, tmp)) })
    await sleep(1500)
    const r = await send('Runtime.evaluate', { expression: 'Math.ceil(document.documentElement.scrollHeight)', returnByValue: true })
    await send('Emulation.setDeviceMetricsOverride', { width: 804, height: Math.min(r.result.result.value, 3600), deviceScaleFactor: 1, mobile: false })
    await sleep(300)
    const png = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(OUT, `lado-a-lado-${name}.png`), Buffer.from(png.result.data, 'base64'))
    fs.unlinkSync(tmp)
    console.log(name)
  }
  ws.close(); edge.kill()
})()
