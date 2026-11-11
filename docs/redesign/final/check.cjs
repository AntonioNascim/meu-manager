// Procura elementos que passam da borda de 380 px ou textos cortados. Uso: node check.cjs
const { pathToFileURL } = require('url'), { spawn } = require('child_process'), fs = require('fs'), path = require('path')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', SRC = path.join(__dirname, 'html'), PORT = 9336
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const JS = `(()=>{const out=[];const inScroll=(e)=>{for(let p=e.parentElement;p;p=p.parentElement){const o=getComputedStyle(p).overflowX;if((o==='auto'||o==='scroll')&&p.scrollWidth>p.clientWidth)return true}return false};
document.querySelectorAll('.app *').forEach(e=>{if(e.closest('svg')&&e.tagName!=='svg')return;const r=e.getBoundingClientRect();if(r.width===0)return;if((r.right>381||r.left<-1)&&!inScroll(e)&&!e.closest('.pitch3,.flat'))out.push('FORA '+e.tagName+'.'+e.className+' '+Math.round(r.left)+'-'+Math.round(r.right)+' '+(e.textContent||'').slice(0,30));
const cs=getComputedStyle(e);if(e.children.length===0&&e.scrollWidth>e.clientWidth+1&&cs.textOverflow!=='ellipsis'&&e.clientWidth>0&&!inScroll(e))out.push('CORTE '+e.tagName+'.'+e.className+' '+(e.textContent||'').slice(0,30))});
return [...new Set(out)].slice(0,8)})()`
;(async () => {
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', `--user-data-dir=${process.env.TEMP}/edge-chk`, 'about:blank'], { stdio: 'ignore' })
  let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break } catch {} await sleep(250) }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
  let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id) } }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 1, mobile: true })
  for (const f of fs.readdirSync(SRC).sort()) {
    await send('Page.navigate', { url: pathToFileURL(path.join(SRC, f)).href }); await sleep(450)
    const r = await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>' + JS + ')', awaitPromise: true, returnByValue: true })
    const v = r.result.result.value; if (v && v.length) console.log(f, '\n  ' + v.join('\n  '))
  }
  ws.close(); edge.kill()
})()
