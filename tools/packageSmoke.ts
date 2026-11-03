// Teste de ponta a ponta da entrega do pacote (Fase 6, B3): usa o próprio código do jogo (PackageSource) contra o Worker.
// Uso: node tools/run.mjs packageSmoke <urlBase> [versaoEmbutidaDeMentira]
// A versão embutida de mentira (padrão 2026.01) tem de ser mais antiga que a publicada, para o aviso de versão nova aparecer.
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { PackageCache } from '../src/store/packageCache'
import { PackageSource, type Memory } from '../src/store/packageSource'

const [base, embeddedVersion = '2026.01'] = process.argv.slice(2)
if (!base) throw new Error('Uso: node tools/run.mjs packageSmoke <urlBase> [versaoEmbutida]')
const file = JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) as { name: string; clubs: unknown[]; players: unknown[] }
const meta = JSON.parse(readFileSync('data/versao.json', 'utf8')) as { id: string }

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. O servidor em si: cabeçalhos e recusas.
const index = await fetch(`${base}/packages/index.json`)
check('índice responde 200 em JSON com cache curto', index.status === 200 && (index.headers.get('content-type') ?? '').includes('json') && /max-age=300/.test(index.headers.get('cache-control') ?? ''), `${index.status} ${index.headers.get('cache-control')}`)
const idx = (await index.json()) as { packages: { path: string; gzipBytes: number; version: string }[] }
const listed = idx.packages[idx.packages.length - 1]!
const f = await fetch(`${base}/packages/${listed.path}`, { headers: { Origin: 'https://antonionascim.github.io' } })
const body = new Uint8Array(await f.arrayBuffer())
check('arquivo vem como gzip cru (sem Content-Encoding), imutável por um ano', f.status === 200 && f.headers.get('content-type') === 'application/gzip' && !f.headers.get('content-encoding') && /immutable/.test(f.headers.get('cache-control') ?? ''), `${f.status} ${f.headers.get('content-type')} enc=${f.headers.get('content-encoding')}`)
check('arquivo tem o tamanho do índice e o CORS do site', body.byteLength === listed.gzipBytes && f.headers.get('access-control-allow-origin') === 'https://antonionascim.github.io', `${body.byteLength} bytes`)
const head = await fetch(`${base}/packages/${listed.path}`, { method: 'HEAD' })
check('HEAD responde sem corpo', head.status === 200 && (await head.arrayBuffer()).byteLength === 0)
for (const [name, path, method, status] of [
  ['versão que não existe', '/packages/mundo-real/2099.01/pacote.json.gz', 'GET', 404],
  ['caminho com barras codificadas (fora do padrão)', '/packages/mundo-real%2F..%2Findex.json', 'GET', 404],
  ['arquivo qualquer', '/packages/mundo-real/2026.11/outro.bin', 'GET', 404],
  ['escrita não é permitida', '/packages/index.json', 'POST', 405],
] as const) {
  const r = await fetch(base + path, { method })
  check(`${name} (${status})`, r.status === status, String(r.status))
}

// 2. O jogo: avisa, baixa, confere, guarda e abre.
const store = new Map<string, string>()
const memory: Memory = { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) }
const source = new PackageSource({
  cache: new PackageCache('pacote-smoke'),
  fetchFn: (i, init) => fetch(i, init),
  apiBase: base,
  id: meta.id,
  embedded: { version: embeddedVersion, name: 'Mundo real', gameId: 'embutido:mundo-real', load: async () => JSON.parse(readFileSync('data/pacote-real.json', 'utf8')) },
  memory,
  now: () => Date.now(),
})
const notice = await source.checkForUpdate(true)
check('o jogo vê a versão nova no índice', notice?.version === listed.version, notice?.version)
const t0 = performance.now()
await source.download(notice!)
check('baixa, confere o hash e guarda', true, `${Math.round(performance.now() - t0)} ms`)
const loaded = await source.load()
check('jogo novo passa a usar a versão baixada', loaded.origin === 'downloaded' && loaded.gameId === `baixado:${meta.id}@${listed.version}`, `${loaded.version} (${loaded.origin})`)
check('o conteúdo baixado é idêntico ao arquivo original (clubes e jogadores)', loaded.pkg.name === file.name && loaded.pkg.clubs.length === file.clubs.length && loaded.pkg.players.length === file.players.length, `${loaded.pkg.clubs.length} clubes, ${loaded.pkg.players.length} jogadores`)
check('depois de baixar, não há mais aviso', (await source.checkForUpdate(true)) === undefined)

console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} verificação(ões) falharam.`)
process.exit(failures === 0 ? 0 : 1)
