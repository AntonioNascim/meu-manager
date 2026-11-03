// Teste de ponta a ponta da API de identidade (Fase 6, B2): assina pedidos com o código do jogo e confere as respostas do Worker.
// Uso: node tools/run.mjs identitySmoke <urlBase> <local|cloud|real>
//   local: o Worker roda com a chave de teste do Turnstile (aprova qualquer desafio); confere também o limite de criações por IP (30 por dia).
//   real: igual ao local, mas com um token de verdade do Turnstile (variável TURNSTILE_TOKEN, de uso único, tirado do widget num navegador); sem o teste de limite.
//   cloud: com a chave real do Turnstile um desafio de mentira tem de ser reprovado (403); não dá para testar o caminho feliz sem um navegador.
import { createIdentity } from '../src/online/identity'
import { signRequest } from '../src/online/signedRequest'

const [base, mode = 'local'] = process.argv.slice(2)
if (!base) throw new Error('Uso: node tools/run.mjs identitySmoke <urlBase> <local|cloud|real>')

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function call(identity: ReturnType<typeof createIdentity>['identity'] | undefined, method: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
  const parts = { method, path, body: text }
  const authorization = identity ? signRequest(identity, parts, Date.now(), random) : undefined
  const res = await fetch(base + path, { method, body: method === 'GET' ? undefined : text, headers: { ...(authorization ? { Authorization: authorization } : {}), ...headers } })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json, authorization, text }
}

const token = process.env.TURNSTILE_TOKEN ?? 'XXXX.DUMMY.TOKEN.XXXX'
if (mode === 'real' && !process.env.TURNSTILE_TOKEN) throw new Error('Falta TURNSTILE_TOKEN')
const a = createIdentity(random).identity

if (mode === 'cloud') {
  const r = await call(a, 'POST', '/api/identity', { turnstileToken: token })
  check('desafio de mentira é reprovado (403, falha fechada)', r.status === 403 && r.json.error === 'turnstile-failed', `${r.status} ${JSON.stringify(r.json)}`)
  const none = await call(undefined, 'GET', '/api/me', undefined)
  check('pedido sem assinatura é recusado (401)', none.status === 401, String(none.status))
  const unknown = await call(a, 'GET', '/api/me', undefined)
  check('identidade que não foi criada é desconhecida (404)', unknown.status === 404, `${unknown.status} ${JSON.stringify(unknown.json)}`)
  const nf = await call(a, 'GET', '/api/nada', undefined)
  check('rota que não existe (404)', nf.status === 404, String(nf.status))
  const pre = await fetch(base + '/api/identity', { method: 'OPTIONS', headers: { Origin: 'https://antonionascim.github.io', 'Access-Control-Request-Method': 'POST' } })
  check('CORS libera o site', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://antonionascim.github.io', String(pre.status))
  const bad = await fetch(base + '/api/identity', { method: 'OPTIONS', headers: { Origin: 'https://exemplo.com', 'Access-Control-Request-Method': 'POST' } })
  check('CORS não libera outro site', bad.headers.get('access-control-allow-origin') === null)
} else {
  const created = await call(a, 'POST', '/api/identity', { turnstileToken: token, nickname: ' Mister  Pedro ' })
  check('cria a identidade (201) com o apelido limpo', created.status === 201 && created.json.nickname === 'Mister Pedro' && created.json.playerId === a.playerId, `${created.status} ${JSON.stringify(created.json)}`)

  const replay = await fetch(base + '/api/identity', { method: 'POST', body: created.text, headers: { Authorization: created.authorization! } })
  check('o mesmo pedido repetido é recusado (401, replay)', replay.status === 401, String(replay.status))

  const me = await call(a, 'GET', '/api/me', undefined)
  check('/api/me devolve a identidade', me.status === 200 && me.json.playerId === a.playerId && me.json.nickname === 'Mister Pedro', `${me.status} ${JSON.stringify(me.json)}`)

  const again = await call(a, 'POST', '/api/identity', { turnstileToken: token })
  check('registrar de novo reconhece a identidade (200, created=false)', again.status === 200 && again.json.created === false, `${again.status} ${JSON.stringify(again.json)}`)

  const b = createIdentity(random).identity
  const bad = await call(b, 'POST', '/api/identity', { turnstileToken: token, nickname: 'Admin' })
  check('apelido proibido (400)', bad.status === 400 && bad.json.issue === 'impersonal', `${bad.status} ${JSON.stringify(bad.json)}`)

  const extra = await call(b, 'POST', '/api/identity', { turnstileToken: token, admin: true })
  check('campo extra no corpo (400)', extra.status === 400, String(extra.status))

  const noSig = await call(undefined, 'GET', '/api/me', undefined)
  check('sem assinatura (401)', noSig.status === 401, String(noSig.status))

  const stranger = await call(createIdentity(random).identity, 'GET', '/api/me', undefined)
  check('identidade desconhecida (404)', stranger.status === 404, String(stranger.status))

  if (mode === 'local') {
  // Toda tentativa deste IP conta (as recusadas também): continue até bater no teto de 30 por dia.
  let blocked: { status: number; json: Record<string, unknown> } | undefined
  for (let i = 0; i < 40 && !blocked; i++) {
    const r = await call(createIdentity(random).identity, 'POST', '/api/identity', { turnstileToken: token })
    if (r.status === 429) blocked = r
  }
  check('o limite de criações por IP bloqueia (429, com tempo de espera)', !!blocked && typeof blocked.json.retryAfterMs === 'number', JSON.stringify(blocked?.json))
  }
}

console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} verificação(ões) falharam.`)
process.exit(failures === 0 ? 0 : 1)
