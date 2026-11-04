// Teste de ponta a ponta dos saves na nuvem (Fase 6, B4): usa o código do jogo (SaveStore + CloudSync + CloudClient) contra o Worker.
// Uso: node tools/run.mjs cloudSaveSmoke <urlBase> <local|cloud>
//   local: o Worker roda com `wrangler dev --local` (chave de teste do Turnstile, R2 simulado): a identidade é criada pela própria API.
//   cloud: a identidade de teste precisa existir no D1 (a API só cria com um desafio humano do Turnstile). Na primeira execução a ferramenta
//          mostra o `playerId` de teste; quem roda cadastra a linha no D1 com `wrangler d1 execute`, roda de novo e, no fim, a ferramenta
//          apaga tudo (saves e cadastro) pela própria rota "Apagar minha conta". A semente fica num arquivo FORA do repositório (SMOKE_SEED_FILE).
import 'fake-indexeddb/auto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { CloudClient } from '../src/online/cloudClient'
import { createIdentity, identityFromSeed, toBase64Url, fromBase64Url } from '../src/online/identity'
import { signRequest } from '../src/online/signedRequest'
import { CloudStateStore } from '../src/store/cloudState'
import { CloudSync } from '../src/store/cloudSync'
import { advanceToMatchday, createGame, playPendingAuto } from '../src/store/game'
import type { Game } from '../src/store/game'
import { compactGame } from '../src/store/saveFormat'
import { SaveStore } from '../src/store/saves'

const [base, mode = 'local'] = process.argv.slice(2)
if (!base) throw new Error('Uso: node tools/run.mjs cloudSaveSmoke <urlBase> <local|cloud>')

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))

const play = (game: Game, days: number): Game => {
  let g = game
  for (let i = 0; i < days; i++) g = playPendingAuto(advanceToMatchday(g))
  return g
}

// 1. A identidade de teste.
let identity: ReturnType<typeof createIdentity>['identity']
if (mode === 'cloud') {
  const file = process.env.SMOKE_SEED_FILE
  if (!file) throw new Error('Falta SMOKE_SEED_FILE (um arquivo fora do repositório)')
  if (!existsSync(file)) writeFileSync(file, toBase64Url(random(32)))
  identity = identityFromSeed(fromBase64Url(readFileSync(file, 'utf8').trim())!)
} else {
  identity = createIdentity(random).identity
  const text = JSON.stringify({ turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' })
  const parts = { method: 'POST', path: '/api/identity', body: text }
  const res = await fetch(base + parts.path, { method: 'POST', body: text, headers: { Authorization: signRequest(identity, parts, Date.now(), random) } })
  if (res.status !== 201) throw new Error(`Não criou a identidade de teste: ${res.status}`)
}
const client = () => new CloudClient({ base, identity, fetchFn: (i, init) => fetch(i, init), now: () => Date.now(), randomBytes: random })
const me = await client().list().then(
  () => true,
  (e: unknown) => (console.log(`Identidade de teste ainda não registrada (${e instanceof Error ? e.message : e}). playerId = ${identity.playerId}`), false),
)
if (!me) process.exit(2)

async function device(name: string) {
  const local = new SaveStore(`smoke-${name}`)
  const state = new CloudStateStore(`smoke-nuvem-${name}`)
  return { local, state, sync: new CloudSync({ local, state, client: client(), now: () => Date.now(), randomText: () => `dev-${name}-${toBase64Url(random(6))}` }) }
}

const day8 = play(createGame(6, 'team-imp', { cups: false }), 8)
const day9 = play(day8, 1)
const a = await device('a')
const b = await device('b')

try {
  // 2. Primeiro envio, depois só o que mudou.
  await a.local.saveToSlot(1, day8)
  await a.sync.enable(1)
  const t0 = performance.now()
  check('primeiro envio do save inteiro', (await a.sync.sync(1)) === 'synced', `${Math.round(performance.now() - t0)} ms`)
  const rev1 = await client().manifest(1)
  const total = rev1 ? Object.values(rev1.parts).reduce((n, p) => n + p.size, 0) : 0
  check('a nuvem tem o manifesto (rev 1) e o save cabe na cota', rev1?.rev === 1 && total < 5 * 1024 * 1024, `${Object.keys(rev1?.parts ?? {}).length} pedaços, ${(total / 1024).toFixed(0)} KB`)
  check('sem mudança, nada é enviado', (await a.sync.sync(1)) === 'already')
  await a.local.saveToSlot(1, day9)
  const t1 = performance.now()
  check('um dia depois, o envio é só do que mudou', (await a.sync.sync(1)) === 'synced', `${Math.round(performance.now() - t1)} ms`)

  // 3. O segundo aparelho baixa e confere.
  check('outro aparelho baixa o save', (await b.sync.pull(1)) === 'pulled')
  check('o save baixado é idêntico ao enviado', same(await b.local.loadSlot(1), compactGame(day9)))

  // 4. Dois aparelhos.
  await a.local.saveToSlot(1, play(day9, 1), new Date(Date.now() + 1000))
  check('A envia mais um dia', (await a.sync.sync(1)) === 'synced')
  const bGame = play(day9, 2)
  await b.local.saveToSlot(1, bGame, new Date(Date.now() + 2000))
  check('B (desatualizado) cai em conflito e não sobrescreve', (await b.sync.sync(1)) === 'conflict')
  check('o save local de B ficou intacto', same(await b.local.loadSlot(1), compactGame(bGame)))
  check('"usar este" resolve o conflito', (await b.sync.resolve(1, 'local')) === 'synced')
  const afterForce = await client().list()
  check('a nuvem guardou a versão anterior como cópia', afterForce.saves[0]?.backup !== null && afterForce.saves[0]?.manifest?.rev === 4, `rev ${afterForce.saves[0]?.manifest?.rev}`)

  // 5. Recusas do servidor.
  const noAuth = await fetch(`${base}/api/saves`)
  check('sem assinatura: 401', noAuth.status === 401, String(noAuth.status))
  const body = new TextEncoder().encode('conteudo')
  const hash = '0'.repeat(64)
  const parts = { method: 'PUT', path: `/api/saves/1/blob/${hash}`, body }
  const wrong = await fetch(base + parts.path, { method: 'PUT', body, headers: { Authorization: signRequest(identity, parts, Date.now(), random) } })
  check('conteúdo que não bate com o hash: 400', wrong.status === 400, String(wrong.status))
  const slot9 = await fetch(`${base}/api/saves/9`, { headers: { Authorization: signRequest(identity, { method: 'GET', path: '/api/saves/9', body: '' }, Date.now(), random) } })
  check('espaço inexistente: 404', slot9.status === 404, String(slot9.status))
  const open = await fetch(`${base}/api/saves`, { method: 'OPTIONS', headers: { Origin: 'https://antonionascim.github.io', 'Access-Control-Request-Method': 'PUT' } })
  check('CORS libera PUT para o site', (open.headers.get('access-control-allow-methods') ?? '').includes('PUT'), open.headers.get('access-control-allow-methods') ?? '')

  // 6. Exportar e apagar.
  const exported = (await a.sync.exportAccount()) as { playerId: string; saves: unknown[] }
  check('exportar meus dados', exported.playerId === identity.playerId && exported.saves.length === 1)
} finally {
  await a.sync.deleteAccount().catch(() => undefined)
  const gone = await fetch(`${base}/api/saves`, { headers: { Authorization: signRequest(identity, { method: 'GET', path: '/api/saves', body: '' }, Date.now(), random) } })
  check('apagar minha conta: a identidade some (404)', gone.status === 404, String(gone.status))
  await a.local.destroy()
  await b.local.destroy()
  a.state.close()
  b.state.close()
}

console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} verificação(ões) falharam.`)
process.exit(failures === 0 ? 0 : 1)
