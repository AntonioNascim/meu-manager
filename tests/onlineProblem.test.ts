import { describe, expect, it } from 'vitest'
import { PROBLEM_LIMITS, PROBLEM_RETENTION_MS, MemoryProblemStore, submitProblem, type ProblemDeps } from '../src/online/problemApi'
import { RateLimiter } from '../src/online/rateLimit'
import { browserFamily, collectTech } from '../src/ui/techInfo'
import { estimateMonth, serveAdmin } from '../server/admin'

const T0 = 1_800_000_000_000
const jpeg = (n: number): string => {
  const bytes = new Uint8Array(n)
  bytes.set([0xff, 0xd8, 0xff])
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/jpeg;base64,${btoa(bin)}`
}
const body = (over: Record<string, unknown> = {}) => JSON.stringify({ category: 'bug', text: 'A tela de escalação travou ao arrastar.', tech: { app: 'meu-manager', screen: 'clube', online: true }, ...over })

function setup() {
  let now = T0
  let n = 0
  const store = new MemoryProblemStore()
  const deps: ProblemDeps = { store, limiter: new RateLimiter(), now: () => now, randomId: () => `id${++n}` }
  return { deps, store, advance: (ms: number) => (now += ms) }
}

describe('relatar problema (teste fechado)', () => {
  it('guarda o relato anônimo com a imagem, sem nada além do pedido', async () => {
    const { deps, store } = setup()
    const r = await submitProblem(deps, '203.0.113.1', body({ image: jpeg(2000) }))
    expect(r).toEqual({ status: 201, body: { ok: true, id: 'id1' } })
    const saved = await store.get('id1')
    expect(saved?.row).toMatchObject({ category: 'bug', hasImage: true, status: 'open', tech: { screen: 'clube', online: true } })
    expect(saved?.image?.length).toBe(2000)
    expect(JSON.stringify(saved?.row)).not.toContain('203.0.113.1')
  })

  it('recusa corpos inválidos: categoria, texto curto, campos extras, técnica fora da lista, imagem que não é JPEG ou é grande', async () => {
    const { deps } = setup()
    const bad: [string, number][] = [
      [body({ category: 'xingamento' }), 400],
      [body({ text: 'ab' }), 400],
      [body({ extra: 1 }), 400],
      [body({ tech: { playerId: 'abc' } }), 400],
      [body({ tech: { screen: { a: 1 } } }), 400],
      [body({ image: 'data:image/png;base64,AAAA' }), 400],
      [body({ image: jpeg(PROBLEM_LIMITS.imageBytes + 10) }), 400],
      ['não é json', 400],
      ['x'.repeat(PROBLEM_LIMITS.bodyBytes + 1), 413],
    ]
    for (const [text, status] of bad) expect((await submitProblem(deps, `198.51.100.${Math.floor(Math.random() * 200)}`, text)).status).toBe(status)
    // imagem com formato falso (base64 válido, mas não JPEG)
    expect((await submitProblem(deps, '198.51.100.250', body({ image: 'data:image/jpeg;base64,AAAAAAAA' }))).status).toBe(400)
  })

  it('o limite por IP conta toda tentativa e o teto diário protege o servidor', async () => {
    const { deps, advance } = setup()
    for (let i = 0; i < 6; i++) expect((await submitProblem(deps, '203.0.113.9', body())).status).toBe(201)
    expect((await submitProblem(deps, '203.0.113.9', body())).status).toBe(429)
    advance(3_700_000)
    expect((await submitProblem(deps, '203.0.113.9', body())).status).toBe(201)
    // Outro IP ainda passa; mas com o teto do dia cheio ninguém passa.
    const full = setup()
    for (let i = 0; i < PROBLEM_LIMITS.perDay; i++) await full.store.add({ id: `x${i}`, createdAt: T0, category: 'bug', text: 'texto', tech: {}, hasImage: false, status: 'open' })
    expect((await submitProblem(full.deps, '192.0.2.1', body())).status).toBe(503)
  })

  it('a limpeza apaga relatos com mais de 90 dias e o painel marca como resolvido', async () => {
    const { deps, store, advance } = setup()
    await submitProblem(deps, '203.0.113.2', body())
    advance(PROBLEM_RETENTION_MS + 1000)
    await submitProblem(deps, '203.0.113.3', body())
    expect(await store.purgeBefore(T0 + PROBLEM_RETENTION_MS)).toBe(1)
    expect((await store.list('open', 10)).length).toBe(1)
    expect(await store.setStatus('id2', 'done')).toBe(true)
    expect((await store.list('done', 10)).length).toBe(1)
  })

  it('as informações técnicas não identificam a pessoa e o navegador vira só uma família', () => {
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36')).toEqual({ browser: 'Chrome 126', os: 'Android 14', device: 'celular' })
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1').browser).toBe('Safari 17')
    const t = collectTech({ screen: 'menu', mode: 'solo', leagueId: 'abc' })
    expect(t.screen).toBe('menu')
    expect(t.leagueId).toBeUndefined()
    expect(collectTech({ screen: 'sala', leagueId: 'abc' }, { includeLeagueId: true }).leagueId).toBe('abc')
    expect(Object.keys(t).every((k) => ['app', 'build', 'mode', 'screen', 'browser', 'os', 'device', 'timezoneOffset', 'viewport', 'language', 'online', 'pixelRatio', 'installed', 'connection', 'memoryMB', 'errors'].includes(k))).toBe(true)
  })

  it('a estimativa do mês cresce com ligas e técnicos e fica no plano de US$ 5 para o teste fechado', () => {
    const small = estimateMonth(5, 30)
    expect(small.usd).toBe(5)
    expect(estimateMonth(10, 60).requests).toBeGreaterThan(small.requests)
    expect(estimateMonth(0, 0)).toMatchObject({ requests: 0, usd: 5 })
  })
  it('a página do /admin deixa mostrar a imagem do relato (img-src data:) e continua fechada para o resto', async () => {
    const env = { ADMIN_TOKEN: 'x'.repeat(24) } as unknown as Parameters<typeof serveAdmin>[2]
    const url = new URL('https://api.example/admin')
    const res = await serveAdmin(new Request(url), url, env, undefined as never, undefined as never, undefined as never)
    const csp = res!.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain('img-src data:')
    expect(csp).not.toMatch(/img-src[^;]*(\*|https?:)/)
  })
})
