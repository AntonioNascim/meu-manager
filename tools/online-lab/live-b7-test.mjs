// Roteiro local da B7 (sem custo): sobe o Worker de laboratório (wrangler dev --local) e testa de ponta a ponta. Uso:
//   npx wrangler dev --local -c wrangler.b7.toml --port 8788 --var LAB_KEY:teste   (em outro terminal)
//   node live-b7-test.mjs http://127.0.0.1:8788 teste
const [base = 'http://127.0.0.1:8788', key = 'teste'] = process.argv.slice(2)
const room = 'sala-' + Date.now().toString(36)
const H = { 'x-lab-key': key }
const api = async (path, init = {}) => (await fetch(`${base}/lab/${room}${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } }))
const json = async (path, init) => { const r = await api(path, init); const t = await r.text(); try { return JSON.parse(t) } catch { throw new Error(`${path}: ${r.status} ${t.slice(0, 300)}`) } }
const post = (path, body = {}) => json(path, { method: 'POST', body: JSON.stringify(body) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++ }

function connect(player) {
  const url = base.replace(/^http/, 'ws') + `/lab/${room}/ws?player=${player}&key=${key}`
  const ws = new WebSocket(url)
  const got = []
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)))
  const opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('ws erro'))) })
  return { ws, got, opened, send: (m) => ws.send(JSON.stringify(m)) }
}

const MINUTE_MS = 150
const init = await post(`/init?minuteMs=${MINUTE_MS}`)
check('sala criada', init.seats?.length === 2, JSON.stringify(init.seats))

const a = connect('jogador-1'); await a.opened
const b = connect('jogador-2'); await b.opened
a.send({ t: 'hello', since: 0 }); b.send({ t: 'hello', since: 0 })
await sleep(300)
check('sem evento ainda: aviso not-in-event', a.got.some((m) => m.t === 'error' && m.problem === 'not-in-event'))

let info = await post('/admin/advance', { by: 'adm' })
check('evento ao vivo começou', info.live !== null, JSON.stringify(info.live))
a.send({ t: 'hello', since: 0 }); b.send({ t: 'hello', since: 0 })
await sleep(600)
const full = a.got.find((m) => m.t === 'full')
check('cliente recebe o estado completo', !!full && full.games.length >= 1)
check('quadros por minuto chegam', a.got.filter((m) => m.t === 'frame').length >= 2)

a.send({ t: 'cmd', id: 'c1', command: { type: 'mentality', mentality: 2 } })
a.send({ t: 'cmd', id: 'ruim', command: { type: 'substitute', outgoingId: 'x1', incomingId: 'x2' } })
a.send({ t: 'cmd', id: 'c2', command: { type: 'control', controlled: false } })
await sleep(800)
const results = a.got.filter((m) => m.t === 'result').flatMap((m) => m.outcomes)
check('comando aceito no próximo minuto', results.some((o) => o.id === 'c1' && o.ok))
check('comando inválido recusado pelo motor', results.some((o) => o.id === 'ruim' && !o.ok && o.reason === 'engine'))
check('comando de controle do cliente barrado', a.got.some((m) => m.t === 'error' && m.problem === 'bad-command'))

// jogador-2 cai e volta
b.ws.close(); await sleep(900)
info = await json('/admin/info')
check('quem caiu sai da lista de conectados', info.live && !info.live.connected.includes('jogador-2'), JSON.stringify(info.live?.connected))
const b2 = connect('jogador-2'); await b2.opened; b2.send({ t: 'hello', since: 0 }); await sleep(500)
check('reconexão devolve o estado completo', b2.got.some((m) => m.t === 'full'))

// reinício de verdade no meio do jogo
const before = (await json('/admin/info')).live?.clock
await api('/crash').catch(() => {})
await sleep(1500)
info = await json('/admin/info')
check('objeto reiniciado (boot subiu) e a partida continua do mesmo ponto', info.boot >= 2 && (info.live === null || info.live.clock >= before), `boot=${info.boot} clock ${before} -> ${info.live?.clock}`)

// espera acabar (≈ 120 minutos * 150 ms + folga)
for (let i = 0; i < 80; i++) { info = await json('/admin/info'); if (!info.live) break; await sleep(500) }
check('evento terminou sozinho', info.live === null && info.current === null, JSON.stringify(info.current))
check('registros de reprodução guardados', info.replays >= 1, `n=${info.replays}`)
const verify = await json('/verify')
check('toda partida refeita pelo registro dá o mesmo resultado', verify.length >= 1 && verify.every((v) => v.ok), JSON.stringify(verify))
check('quem ficou conectado conta como presente (sem falta)', info.seats.find((s) => s.playerId === 'jogador-1').missed === 0)

a.ws.close(); b2.ws.close()
console.log(failed === 0 ? '\nTudo certo.' : `\n${failed} verificação(ões) falharam.`)
process.exit(failed === 0 ? 0 : 1)
